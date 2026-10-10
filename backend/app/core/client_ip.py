from fastapi import Request

from app.constants.access import IP_ADDRESS_MAX_LENGTH, UNKNOWN_CLIENT_IP
from app.core.config import get_settings


def get_client_ip(request: Request) -> str:
    trusted_header = get_settings().trusted_client_ip_header
    if trusted_header:
        header_value = request.headers.get(trusted_header, "").strip()
        if header_value:
            return header_value[:IP_ADDRESS_MAX_LENGTH]
    if request.client is None or not request.client.host:
        return UNKNOWN_CLIENT_IP
    return request.client.host[:IP_ADDRESS_MAX_LENGTH]
