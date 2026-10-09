import base64
import hashlib
import secrets
import webbrowser
from getpass import getpass
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlencode, urlsplit

import httpx

from scripts.backup.drive import HTTP_TIMEOUT_SECONDS, DriveClient, exchange_token
from scripts.backup.upload import (
    CLIENT_ID_VARIABLE,
    CLIENT_SECRET_VARIABLE,
    FOLDER_ID_VARIABLE,
    REFRESH_TOKEN_VARIABLE,
)

GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth"
DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"
LOOPBACK_HOST = "127.0.0.1"
BACKUP_FOLDER_NAME = "Copias de seguridad de la base"
BROWSER_DONE_MESSAGE = "Listo. Ya puede cerrar esta pestaña y volver a la terminal."


class AuthorizationDenied(Exception):
    pass


def code_challenge(code_verifier: str) -> str:
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def authorization_url(client_id: str, redirect_uri: str, state: str, code_verifier: str) -> str:
    query = urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": DRIVE_FILE_SCOPE,
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
            "code_challenge": code_challenge(code_verifier),
            "code_challenge_method": "S256",
        }
    )
    return f"{GOOGLE_AUTHORIZATION_URL}?{query}"


def authorization_code_from_callback(query: str, expected_state: str) -> str:
    values = parse_qs(query)
    if values.get("state", [""])[0] != expected_state:
        raise AuthorizationDenied("La respuesta de Google no corresponde a este pedido.")
    if "error" in values:
        raise AuthorizationDenied(f"Google no dio la autorización: {values['error'][0]}.")
    code = values.get("code", [""])[0]
    if not code:
        raise AuthorizationDenied("La respuesta de Google no trae el código de autorización.")
    return code


def is_authorization_callback(query: str) -> bool:
    values = parse_qs(query)
    return "code" in values or "error" in values


def wait_for_callback_query(server: HTTPServer) -> str:
    received: list[str] = []

    class CallbackHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            query = urlsplit(self.path).query
            if is_authorization_callback(query):
                received.append(query)
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(BROWSER_DONE_MESSAGE.encode("utf-8"))

        def log_message(self, format: str, *args: object) -> None:
            return

    server.RequestHandlerClass = CallbackHandler
    while not received:
        server.handle_request()
    return received[0]


def main() -> None:
    client_id = input("ID de cliente de Google: ").strip()
    client_secret = getpass("Secreto del cliente (no se ve al escribirlo): ").strip()
    state = secrets.token_urlsafe(32)
    code_verifier = secrets.token_urlsafe(64)
    with HTTPServer((LOOPBACK_HOST, 0), BaseHTTPRequestHandler) as server:
        redirect_uri = f"http://{LOOPBACK_HOST}:{server.server_port}"
        url = authorization_url(client_id, redirect_uri, state, code_verifier)
        print("Se abre el navegador para autorizar. Si no se abre, copiá esta dirección:")
        print(url)
        webbrowser.open(url)
        query = wait_for_callback_query(server)
    code = authorization_code_from_callback(query, state)
    with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS) as http:
        tokens = exchange_token(
            http,
            {
                "grant_type": "authorization_code",
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "code_verifier": code_verifier,
            },
        )
        refresh_token = tokens.get("refresh_token")
        if not refresh_token:
            raise SystemExit("Google no devolvió la autorización permanente. Repetí el paso.")
        folder_id = DriveClient(http, tokens["access_token"]).create_folder(BACKUP_FOLDER_NAME)
    print()
    print(f'Se creó en tu Google Drive la carpeta "{BACKUP_FOLDER_NAME}".')
    print("Cargá estos secretos en GitHub y después cerrá esta ventana:")
    print(f"  {CLIENT_ID_VARIABLE} = el ID de cliente que escribiste al principio")
    print(f"  {CLIENT_SECRET_VARIABLE} = el secreto del cliente que escribiste al principio")
    print(f"  {REFRESH_TOKEN_VARIABLE} = {refresh_token}")
    print(f"  {FOLDER_ID_VARIABLE} = {folder_id}")


if __name__ == "__main__":
    main()
