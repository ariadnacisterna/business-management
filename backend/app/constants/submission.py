SUBMISSION_KEY_HEADER_NAME = "Idempotency-Key"
SUBMISSION_KEY_MIN_LENGTH = 16
SUBMISSION_KEY_MAX_LENGTH = 100
SUBMISSION_KEY_PATTERN = r"[A-Za-z0-9_-]+"
SUBMISSION_OPERATION_MAX_LENGTH = 255
SUBMISSION_FINGERPRINT_LENGTH = 64
SUBMISSION_RETENTION_HOURS = 24
SUBMISSION_UNIQUE_CONSTRAINT_NAME = "uq_submission_account_id_key"

SUBMISSION_KEY_DESCRIPTION = (
    "Clave única de este envío, generada por la aplicación. Si el mismo envío llega dos veces "
    "(doble toque o reintento por mala señal), la segunda vez se devuelve el resultado de la "
    "primera sin aplicar la operación de nuevo."
)
MISSING_SUBMISSION_KEY_DETAIL = "Falta la clave de envío. Recargá la página e intentá de nuevo."
REUSED_SUBMISSION_KEY_DETAIL = (
    "Esta clave de envío ya se usó para otra operación. Recargá la página e intentá de nuevo."
)
