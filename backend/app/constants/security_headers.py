STRICT_TRANSPORT_SECURITY = "max-age=31536000; includeSubDomains"
CONTENT_TYPE_OPTIONS = "nosniff"
FRAME_OPTIONS = "DENY"
REFERRER_POLICY = "same-origin"

SELF_SOURCE = "'self'"
NONE_SOURCE = "'none'"
DATA_SOURCE = "data:"
BLOB_SOURCE = "blob:"

API_DOC_PATHS = frozenset({"/docs", "/docs/oauth2-redirect", "/redoc", "/openapi.json"})

UNEXPECTED_ERROR_DETAIL = "Ocurrio un error inesperado. Intenta de nuevo en unos minutos"
