# Backend

API en FastAPI + SQLAlchemy 2.x (síncrono) + Alembic sobre PostgreSQL. Ver
`docs/09-propuesta-arquitectura-tecnica.md` y `docs/12-estandares-de-codigo.md`
en la raíz del repositorio para las decisiones que sustentan esta estructura.

## Configuración

Variables de entorno (ver `.env.example`): `DATABASE_URL`,
`DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `INITIAL_ORGANIZATION_NAME`,
`INITIAL_BUSINESS_NAME`, `INITIAL_BUSINESS_RUBRO`, `INITIAL_ADMIN_NAME`,
`INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_PASSWORD`, `SESSION_TTL_MINUTES`,
`COOKIE_SECURE`. Copiar a `.env` (no se versiona) para desarrollo local.

`INITIAL_ADMIN_USERNAME` e `INITIAL_ADMIN_PASSWORD` no tienen valor por
defecto: la migración que agrega autenticación (ver "Migraciones" abajo) crea
con ellos la primera cuenta Administrador, porque sin una cuenta existente
nadie podría crear la siguiente por la API (RF-031). Deben definirse antes de
migrar y la contraseña debe cambiarse desde la aplicación apenas haya acceso.

## Instalación

```
python -m venv .venv
.venv/Scripts/activate
pip install -e ".[dev]"
```

## Migraciones

```
alembic upgrade head
alembic check      # confirma que los modelos y la última revisión no difieren
```

## Pruebas

```
pytest
```

`tests/test_migrations.py` necesita una base PostgreSQL real accesible por
`DATABASE_URL` y **borra y recrea su schema `public`** antes de correr: usar
siempre una base descartable, nunca una con datos reales. Si no hay conexión
disponible, la prueba se salta en vez de fallar.
