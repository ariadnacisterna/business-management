# Despliegue

Resuelve DP-005 y PT-011 (docs/09-propuesta-arquitectura-tecnica.md): hosting gratuito, alcanzable por internet, con HTTPS y autenticación obligatoria, sin publicar el código.

## Servicios elegidos

- **Render** (plan free): corre la aplicación (API FastAPI + build de la SPA, servidos desde el mismo dominio, un solo proceso). Se "duerme" tras 15 minutos sin tráfico y tarda unos segundos en despertar en la próxima visita.
- **Supabase** (plan free): solo la base de datos PostgreSQL. Persistente (no se borra sola como la de Render); si el proyecto está una semana sin actividad se pausa, pero se reactiva solo con el primer uso.

El repositorio se mantiene privado; Render construye la imagen leyendo directamente del repositorio privado (necesita autorizarlo una vez), sin que el código quede público.

## Cómo está armado

- `Dockerfile` (raíz del repo): build en dos etapas. Primero compila la SPA (`frontend/`), después instala el backend e incluye el build de la SPA en `backend/static`.
- `backend/app/main.py`: sirve la API y, para cualquier pedido de navegador (`Accept: text/html`), devuelve `index.html` en vez de la respuesta de la API — así `/products`, `/categories`, etc. funcionan tanto como ruta de la SPA como endpoint de la API, sin pisarse (mismo problema que resolvió T-018 en el proxy de desarrollo, acá resuelto para producción).
- `render.yaml`: describe el servicio para Render (build con Docker, health check en `/health`, variables de entorno).
- Al arrancar, el contenedor corre `alembic upgrade head` antes de levantar el servidor, así la base de datos siempre queda al día con la última migración.

## Pasos para desplegar (los hace el Responsable del proyecto)

1. **Crear la base de datos en Supabase**: crear una cuenta, crear un proyecto nuevo, copiar la cadena de conexión de PostgreSQL (Project Settings → Database → Connection string, modo "Session" o "Transaction pooler"). Va a tener la forma `postgresql://usuario:contraseña@host:puerto/postgres`.
2. **Adaptar la cadena de conexión**: el backend usa el driver `psycopg` (versión 3), así que hay que anteponer `+psycopg` al esquema: `postgresql+psycopg://usuario:contraseña@host:puerto/postgres`.
3. **Crear el servicio en Render**: crear una cuenta, "New Web Service", conectar este repositorio de GitHub (privado), Render va a detectar `render.yaml` solo.
4. **Completar las variables de entorno marcadas como secretas** (`sync: false` en `render.yaml`) desde el panel de Render:
   - `DATABASE_URL`: la cadena de conexión adaptada del paso 2.
   - `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD`: las credenciales de la primera cuenta (rol Dueño). Usar una contraseña más larga que la mínima de 4 caracteres (D-047) para esta cuenta en particular, ya que va a quedar expuesta en internet.
5. **Desplegar**: Render construye la imagen y la levanta sola; la primera vez corre todas las migraciones desde cero sobre la base de Supabase (vacía) y crea la cuenta inicial.
6. **Verificar**: abrir la URL que da Render (algo como `https://abuela-xxxx.onrender.com`), entrar con la cuenta inicial y confirmar que el catálogo real (los datos que ya cargamos en la base local) NO está ahí — es una base nueva y vacía. Si en algún momento se quiere migrar los datos reales de la base local a Supabase, es una tarea aparte (exportar/restaurar un dump de PostgreSQL), no algo que haga este despliegue solo.

## Imagen de producto (T-035)

Las imagenes de producto se guardan en Supabase Storage (no en el servidor de Render, que no tiene disco persistente) y se muestran con una URL publica directa, sin pasar por el backend.

1. **Crear el bucket en Supabase**: panel de Supabase → Storage → New bucket. Marcarlo como publico (lectura publica) para que las URLs de las imagenes funcionen sin autenticacion.
2. **Completar las variables de entorno en Render** (`sync: false` en `render.yaml`, se cargan desde el panel):
   - `SUPABASE_URL`: la URL del proyecto de Supabase (Project Settings → API).
   - `SUPABASE_SERVICE_ROLE_KEY`: la service role key del proyecto (Project Settings → API). Es secreta: nunca va en el repositorio.
   - `SUPABASE_STORAGE_BUCKET`: el nombre del bucket creado en el paso 1.
3. Sin estas tres variables configuradas, subir o quitar una imagen de producto devuelve un error controlado (503) en vez de fallar de forma confusa; el resto de la aplicacion sigue funcionando igual.

## Pendiente

- Dominio propio: por ahora se usa el subdominio gratuito de Render. Migrar a un dominio propio más adelante no requiere cambios de código, solo configurar el dominio en Render.
- Ningún dato real de Casa Diaco se sube a este documento ni al repositorio.
