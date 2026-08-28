# Backend

API en FastAPI + SQLAlchemy 2.x (síncrono) + Alembic sobre PostgreSQL. Ver
`docs/09-propuesta-arquitectura-tecnica.md` y `docs/12-estandares-de-codigo.md`
en la raíz del repositorio para las decisiones que sustentan esta estructura.

## Configuración

Variables de entorno (ver `.env.example`): `DATABASE_URL`,
`DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `INITIAL_ORGANIZATION_NAME`,
`INITIAL_BUSINESS_NAME`, `INITIAL_BUSINESS_RUBRO`. Copiar a `.env` (no se
versiona) para desarrollo local.

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
