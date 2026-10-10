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

## Copia de seguridad semanal (T-074, D-066, D-071)

### Qué hace

Todos los lunes a las 06:00 UTC (03:00 de Argentina) GitHub corre sola la tarea "Copia de seguridad semanal" (archivo `.github/workflows/weekly-backup.yml`). La tarea:

1. Hace una copia completa de la base de Supabase (`pg_dump`).
2. La cifra con la clave de las copias, antes de que salga de GitHub. Sin esa clave nadie puede abrirla, tampoco Google.
3. Comprueba que el archivo cifrado se puede abrir y leer.
4. Lo sube a la carpeta "Copias de seguridad de la base" de tu Google Drive, con un nombre que dice la fecha y la hora (en hora UTC) en que se hizo, por ejemplo `copia-base-2026-10-12-0600.dump.gpg`.
5. Borra de esa carpeta las copias de más de 8 semanas. Solo borra archivos con ese formato de nombre; cualquier otro archivo de la carpeta queda intacto.

Si cualquier paso falla, la tarea termina en error y GitHub te manda un correo. Ninguna copia queda guardada en el repositorio ni en GitHub.

Las imágenes de los productos (Supabase Storage) no entran en esta copia.

La tarea programada solo empieza a correr cuando el archivo del workflow está en la rama `main`.

### Preparación (se hace una sola vez)

#### 1. La clave de cifrado

1. En tu gestor de contraseñas, generá una contraseña nueva al azar de al menos 32 caracteres y guardala con un nombre claro, por ejemplo "Clave de las copias de la base".
2. Esa clave es la única forma de abrir las copias. Si se pierde, las copias no sirven. No la escribas en ningún archivo, documento ni mensaje.

#### 2. La conexión a la base para la copia

1. Entrá a Supabase, abrí el proyecto y tocá el botón **Connect** (arriba).
2. Elegí la pestaña o el tipo **Session pooler** (no "Direct connection": GitHub no puede llegar a esa).
3. Copiá la dirección que empieza con `postgresql://` y reemplazá `[YOUR-PASSWORD]` por la contraseña de la base.
4. Tiene que quedar tal cual la da Supabase, **sin** el `+psycopg` que lleva la de Render.

#### 3. La autorización de Google Drive

Se usa tu propia cuenta de Google, con un permiso que solo deja ver y tocar los archivos que crea la copia (`drive.file`): no puede ver el resto de tu Drive.

1. Entrá a <https://console.cloud.google.com> con la cuenta de Google donde querés guardar las copias.
2. Arriba, en el selector de proyectos, tocá **Proyecto nuevo**, ponele un nombre (por ejemplo "copias-base") y crealo. Asegurate de que quede seleccionado.
3. Menú → **APIs y servicios** → **Biblioteca**. Buscá **Google Drive API** y tocá **Habilitar**.
4. Menú → **APIs y servicios** → **Pantalla de consentimiento de OAuth** (puede aparecer como **Google Auth Platform**). Tocá **Comenzar** y completá: nombre de la aplicación (por ejemplo "Copias de la base"), tu correo como correo de asistencia, público **Externo**, y tu correo como contacto. Aceptá y creá.
5. En **Información de la marca**, en "Dominio de la app", poné la dirección de la aplicación en Render (por ejemplo `https://casa-diaco.onrender.com`) como **Página principal de la aplicación** y también como **Vínculo a la Política de Privacidad**, y guardá: Google no deja publicar sin esos dos datos. Después, en **Público** (o **Audience**), tocá **Publicar app** para que quede **En producción**. Es importante: si queda "En prueba", la autorización vence a los 7 días y las copias empiezan a fallar. Con el permiso `drive.file` Google no pide revisar la aplicación.
6. En **Clientes**, tocá **Crear cliente**, elegí el tipo **App de escritorio**, ponele un nombre y crealo. Copiá el **ID de cliente** y el **Secreto del cliente** que aparecen (los vas a usar en el paso siguiente y en GitHub).
7. En tu computadora, abrí una terminal en la carpeta `backend` del proyecto, activá el entorno virtual (`.venv\Scripts\activate`) y escribí:

   ```
   python -m scripts.backup.authorize
   ```

8. Te pide el ID de cliente (pegalo y Enter) y el secreto del cliente (pegalo y Enter; no se ve mientras lo pegás, es normal).
9. Se abre el navegador. Elegí la cuenta de Google de las copias. Si aparece "Google no verificó esta app", tocá **Configuración avanzada** y después **Ir a …** (es tu propia aplicación). Tocá **Continuar** o **Permitir**.
10. Cuando el navegador dice "Listo", volvé a la terminal: muestra los valores para cargar en GitHub, incluidos `GOOGLE_REFRESH_TOKEN` y `GOOGLE_DRIVE_FOLDER_ID`. Cargalos en el paso 4 y cerrá la terminal.

El paso 7 crea la carpeta "Copias de seguridad de la base" en tu Drive. Tiene que crearla el script y no vos a mano, porque el permiso `drive.file` solo deja usar carpetas creadas por la propia copia. La carpeta es privada: no la compartas. Podés moverla de lugar dentro de tu Drive o cambiarle el nombre sin problema, pero no borres la carpeta ni renombres los archivos de copia.

#### 4. Los secretos en GitHub

En GitHub, abrí el repositorio → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**, y creá uno por cada fila (el nombre tiene que ser exactamente este):

| Nombre del secreto | Qué valor lleva |
|---|---|
| `BACKUP_DATABASE_URL` | La conexión del paso 2 (Session pooler, sin `+psycopg`). |
| `BACKUP_ENCRYPTION_KEY` | La clave del paso 1. |
| `GOOGLE_CLIENT_ID` | El ID de cliente del paso 3.6. |
| `GOOGLE_CLIENT_SECRET` | El secreto del cliente del paso 3.6. |
| `GOOGLE_REFRESH_TOKEN` | El valor que mostró la terminal en el paso 3.10. |
| `GOOGLE_DRIVE_FOLDER_ID` | El valor que mostró la terminal en el paso 3.10. |

GitHub nunca vuelve a mostrar un secreto después de guardarlo; para cambiarlo se usa **Update** y se pega el valor nuevo.

#### 5. El aviso por correo

En GitHub, tu foto (arriba a la derecha) → **Settings** → **Notifications** → **Actions**: dejá activado el aviso por correo y marcado **Only notify for failed workflows**. GitHub manda el aviso de las tareas programadas a la persona que agregó o cambió por última vez el archivo del workflow en `main`.

### Lanzar una copia a mano

1. En GitHub, abrí el repositorio → pestaña **Actions** → a la izquierda, **Copia de seguridad semanal**.
2. Tocá **Run workflow**, dejá la rama `main` y tocá el botón verde **Run workflow**.
3. Tarda unos minutos. Si termina con tilde verde, la copia nueva ya está en la carpeta de Drive. Si termina con cruz roja, ver "Si la copia falla".

### Si la copia falla

Abrí la ejecución con cruz roja en **Actions** y mirá qué paso falló:

- **Volcar y cifrar la base** con "Falta el secreto …": falta cargar ese secreto (paso 4 de la preparación).
- **Volcar y cifrar la base** con un error de conexión: puede ser que Supabase haya pausado el proyecto por falta de uso. Entrá a la aplicación o al panel de Supabase para reactivarlo y lanzá la copia a mano. Si no, revisá que `BACKUP_DATABASE_URL` sea la del Session pooler y tenga la contraseña correcta.
- **Volcar y cifrar la base** con "server version mismatch": Supabase actualizó PostgreSQL a una versión más nueva que la del programa de copia. Hay que subir `POSTGRES_CLIENT_VERSION` en `.github/workflows/weekly-backup.yml` a esa versión (es un cambio para una conversación de tarea), y también instalar esa versión en tu computadora para poder restaurar.
- **Subir a Google Drive** con "Google rechazó la autorización": la autorización de Google se venció o se revocó. Repetí los pasos 3.7 a 3.10 (crea una carpeta nueva) y actualizá `GOOGLE_REFRESH_TOKEN` y `GOOGLE_DRIVE_FOLDER_ID` en GitHub.

### Restaurar una copia

#### Programas necesarios en la computadora (una sola vez)

- **PostgreSQL** de la misma versión que `POSTGRES_CLIENT_VERSION` en el workflow, o más nueva (hoy, 17). Trae el programa `pg_restore`. Para saber qué versión tenés, en una terminal: `pg_restore --version`.
- **Gpg4win** (<https://gpg4win.org>), para descifrar. Con la instalación común alcanza.

Después de instalarlos, cerrá y volvé a abrir la terminal.

#### Pasos

1. En Google Drive, abrí la carpeta "Copias de seguridad de la base" y descargá la copia que quieras (normalmente la más reciente, según la fecha del nombre). Guardala en Descargas, **no** dentro de la carpeta del proyecto.
2. Prepará una base **vacía** donde restaurar:
   - Tiene que ser PostgreSQL de la **misma versión que Supabase (hoy, 17) o más nueva**: en una más vieja la restauración falla (por ejemplo con `unrecognized configuration parameter "transaction_timeout"`).
   - Para una prueba, una base descartable con Docker. En una terminal: `docker run -d --name prueba-restauracion -p 55433:5432 -e POSTGRES_PASSWORD=prueba postgres:17`, esperá unos segundos, y su conexión es `postgresql://postgres:prueba@localhost:55433/postgres`.
   - En un desastre real (se perdió la base de Supabase), un proyecto nuevo de Supabase, y su conexión del **Session pooler** como en el paso 2 de la preparación.
3. Abrí una terminal en la carpeta `backend` del proyecto, activá el entorno virtual (`.venv\Scripts\activate`) y escribí, con la ruta del archivo descargado:

   ```
   python -m scripts.backup.restore "C:\Users\TU_USUARIO\Downloads\copia-base-2026-10-12-0600.dump.gpg"
   ```

4. Te pide la clave de las copias y después la conexión a la base vacía. Ninguna de las dos se ve al escribirla ni queda guardada en ningún archivo ni en el historial de la terminal.
5. Si la base de destino ya tiene tablas, el script se detiene sin tocar nada. Si algo falla durante la restauración, no se aplica ningún cambio.
6. Al terminar muestra cada tabla con su cantidad de filas.
7. Borrá el archivo descargado cuando ya no lo necesites.

Se restauran todas las tablas del sistema (el esquema `public`). Las partes internas de Supabase que también están en la copia (como `auth` o `storage`) no se restauran, porque la aplicación no las usa.

Después de restaurar en un proyecto nuevo de Supabase por un desastre real: en Render, cambiá `DATABASE_URL` por la conexión del proyecto nuevo (con `+psycopg`, ver "Pasos para desplegar") y en GitHub cambiá `BACKUP_DATABASE_URL` por la del proyecto nuevo (sin `+psycopg`). Las imágenes de productos no vuelven, porque no están en la copia.

### Prueba de restauración

Hay que hacerla **antes de empezar a usar datos reales**, y repetirla después de cada cambio grande en la estructura de la base (por ejemplo, cuando se agreguen Ventas o Compras). Una copia que nunca se probó restaurar no es una copia confiable.

1. Lanzá una copia a mano (ver arriba) y esperá la tilde verde.
2. Descargala de Drive.
3. Restaurala en una base descartable con Docker (`prueba-restauracion`), siguiendo "Restaurar una copia".
4. Compará lo que muestra el script con la aplicación: por ejemplo, que la cantidad de filas de `product` coincida con la cantidad de productos, y la de `account` con la cantidad de cuentas. Tiene que aparecer la tabla `alembic_version` con 1 fila.
5. Borrá la base de prueba: `docker rm -f prueba-restauracion`. Borrá el archivo descargado.
6. Anotá la prueba en la tabla de abajo.

| Fecha | Copia probada | Resultado |
|---|---|---|
| 2026-10-09 | `copia-base-2026-10-10-0023.dump.gpg` | Restaurada en PostgreSQL 17 vacío (Docker): 22 tablas, `alembic_version` con 1 fila, 445 productos y 445 variantes. |

## Acceso de emergencia (T-075, D-067)

### Para prevenirlo

Mantené siempre **al menos dos cuentas activas con rol Dueño o Administrador**, de personas distintas. Así, si una se olvida la contraseña o queda desactivada, la otra puede restablecerla desde la pantalla de cuentas, sin necesidad de lo que sigue.

### Cuándo usarlo

Solo cuando **nadie** puede entrar a administrar las cuentas: por ejemplo, la única cuenta Dueño o Administrador se olvidó la contraseña, quedó desactivada o le bajaron el rol por error. Si queda alguna cuenta Dueño o Administrador que puede entrar, usá el restablecimiento de contraseña normal desde la aplicación.

### Qué hace

Corre en tu computadora, no en la página web. Con el nombre de usuario que le digas:

- **Si esa cuenta no existe**, la crea: activa, con rol Dueño y con acceso a todos los negocios.
- **Si ya existe**, la deja activa (si estaba desactivada), con rol Dueño y acceso a todos los negocios, le pone la contraseña nueva y cierra todas sus sesiones abiertas en cualquier dispositivo. El nombre de la persona no cambia.

Antes de cambiar nada muestra un resumen y te pide que escribas `si`. Si escribís otra cosa o solo apretás Enter, no cambia nada. Si algo falla en el medio, tampoco cambia nada: o se aplica todo, o nada.

### Qué necesitás

- La conexión a la base del **Session pooler** de Supabase, la misma del paso 2 de "Copia de seguridad semanal" (también sirve la de Render, la que tiene `+psycopg`).
- El proyecto en tu computadora, con el entorno virtual del backend instalado (el mismo que se usa para restaurar copias).

### Pasos

1. Abrí una terminal en la carpeta `backend` del proyecto y activá el entorno virtual (`.venv\Scripts\activate`).
2. Escribí:

   ```
   python -m scripts.emergency_owner
   ```

3. Te pide la conexión a la base: pegala y Enter. **No se ve mientras la pegás**, es normal.
4. Te pide el nombre de usuario de la cuenta Dueño. Puede ser una cuenta que ya existe (por ejemplo la tuya) o uno nuevo.
5. Si la cuenta no existe, te pide el nombre de la persona para la cuenta nueva.
6. Te pide la contraseña nueva dos veces. **Tampoco se ve al escribirla.** Tiene que cumplir las mismas reglas de siempre (largo mínimo, una mayúscula, una minúscula y un número) y las dos veces tiene que ser igual.
7. Leé el resumen con atención: dice si va a crear o a reactivar la cuenta, qué cambia en cada negocio y cuántas sesiones se van a cerrar.
8. Si está bien, escribí `si` y Enter. Al terminar dice "Listo".
9. Cerrá la terminal.

Ni la conexión ni la contraseña quedan guardadas en ningún archivo ni en el historial de la terminal, y el script nunca las muestra, tampoco en un mensaje de error.

### Si aparece un error

- "No se pudo conectar a la base": revisá que la conexión sea la del Session pooler, con la contraseña de la base correcta, y que el proyecto de Supabase no esté pausado (entrá al panel de Supabase para reactivarlo).
- "La conexión no tiene el formato esperado": copiala de nuevo desde Supabase; tiene que empezar con `postgresql://`.
- "Las contraseñas no coinciden" o un mensaje sobre las reglas de la contraseña: volvé a correrlo desde el paso 2 con otra contraseña.

En todos los casos de error termina con "No se cambió nada".

### Qué hacer después

1. Entrá a la aplicación con esa cuenta y la contraseña nueva.
2. Revisá la pantalla de cuentas: si había alguna cuenta que no debería estar activa o con un rol alto, corregila.
3. Si no hay otra cuenta Dueño o Administrador activa, creá o reactivá una para otra persona de confianza (ver "Para prevenirlo").
4. Si creaste una cuenta nueva solo para entrar y ya no la necesitás, desactivala desde la aplicación usando la otra cuenta.

Las cuentas no guardan quién hizo cada cambio sobre ellas, así que este uso del script no queda anotado dentro del sistema. Si querés registro, anotá la fecha y el motivo por tu cuenta.

## Endurecimiento de seguridad (T-082, D-072)

### Variables de entorno

| Variable | En Render | En tu computadora (`backend/.env`) | Qué hace |
|---|---|---|---|
| `ENABLE_API_DOCS` | `false` (ya está en `render.yaml`) | `true` | Con `true` se abren `/docs`, `/redoc` y `/openapi.json` (la documentación automática de la API). Sin la variable, o con `false`, esas direcciones no existen. En Render tienen que quedar cerradas: le muestran a cualquiera la lista completa de funciones del sistema. |
| `RENDER` | La pone Render sola (`true`), no hay que cargarla | No va | Con `RENDER=true` la cookie de sesión siempre es `Secure` (solo viaja por HTTPS), aunque `COOKIE_SECURE` quede en `false` por error, y la dirección IP de cada visita se toma del encabezado `CF-Connecting-IP`. |
| `COOKIE_SECURE` | `true` | `false` si probás la aplicación con `http://localhost` | En tu computadora sin HTTPS, con `true` el navegador no guarda la cookie de sesión. |
| `CLIENT_IP_HEADER` | No hace falta | No va | Solo si algún día la aplicación se mueve a otro servicio que no sea Render: el nombre del encabezado que pone ese servicio con la IP real de la visita. Nunca poner uno que el navegador pueda mandar por su cuenta, como `X-Forwarded-For`. |

### Límite de intentos en el inicio de sesión

- Tras **5 intentos fallidos seguidos para un mismo usuario** en 15 minutos, ese usuario queda bloqueado. Un inicio de sesión correcto vuelve el conteo a cero.
- Tras **20 intentos fallidos desde una misma dirección IP** en 15 minutos, esa dirección queda bloqueada para cualquier usuario.
- El bloqueo dura hasta que el más viejo de esos intentos fallidos cumple 15 minutos; los intentos hechos mientras está bloqueado no lo alargan. Siempre se termina solo: nadie puede dejar afuera al Dueño para siempre, solo hacerlo esperar.
- La pantalla de inicio de sesión dice, en grande, cuántos minutos esperar. El mensaje es el mismo exista o no el usuario.
- Cada intento queda guardado en la tabla `login_attempt` (usuario escrito, IP, fecha y hora, y si salió bien, salió mal o estaba bloqueado), para que T-081 pueda avisar de accesos sospechosos. Los intentos de más de 90 días se borran solos.
- Los números están en `backend/app/constants/access.py` (`LOGIN_MAX_FAILURES_PER_USER`, `LOGIN_MAX_FAILURES_PER_IP`, `LOGIN_FAILURE_WINDOW_MINUTES`, `LOGIN_ATTEMPT_RETENTION_DAYS`).
- Si alguien queda bloqueado y no puede esperar: un Administrador no puede saltear el bloqueo desde la aplicación. Se puede borrar a mano desde el panel de Supabase (Table Editor → `login_attempt` → borrar las filas `failed` de ese usuario), o esperar los 15 minutos.

### Archivos subidos

- Las imágenes de producto se aceptan solo si su contenido empieza como un JPG, PNG o WEBP de verdad (los primeros bytes del archivo); lo que diga el navegador sobre el tipo no cuenta. Límite: 5 MB.
- Los archivos de importación `.xlsx` tienen que ser un Excel de verdad, y los `.csv` tienen que ser texto. Límite: 10 MB.

### Qué revisar a mano después del despliegue

1. **Cabeceras**: abrí la aplicación en Chrome o Edge, apretá F12, pestaña **Red** (Network), recargá la página con F5 y tocá la primera fila (el nombre de la página). En **Encabezados de respuesta** tienen que aparecer `strict-transport-security`, `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: same-origin` y `content-security-policy`. Tocá también un archivo `.js` de la lista: tiene que tener las mismas.
2. **La aplicación no se rompió**: con F12 abierto, en la pestaña **Consola**, recorré inicio de sesión, productos (con alguna foto de producto visible), una importación de prueba y cerrar sesión. No tiene que aparecer ningún error rojo que diga `Content Security Policy` o `Refused to load`. Si aparece, copiá el mensaje completo para una conversación de tarea.
3. **Fotos de producto**: que se vean las fotos ya cargadas y que se pueda subir una nueva y ver la vista previa.
4. **Documentación cerrada**: abrí `https://TU-APP.onrender.com/openapi.json`: no tiene que mostrar una lista de funciones (aparece la aplicación o un error "Not Found").
5. **Límite de intentos**: con un usuario de prueba, poné mal la contraseña 5 veces: al sexto intento tiene que aparecer el aviso grande con los minutos de espera.
6. **IP real**: en el panel de Supabase → Table Editor → `login_attempt`, en las filas de la prueba anterior, la columna `ip_address` tiene que ser la IP pública de tu conexión (la que aparece si buscás "cuál es mi IP" en Google) y no siempre la misma dirección interna para todos. Si fuera siempre igual para todos, avisá en una conversación de tarea.
7. **Cookie segura**: F12 → pestaña **Aplicación** (Application) → **Cookies** → la dirección de la aplicación: la cookie `session_id` tiene que tener tildada la columna **Secure** y **HttpOnly**.
8. **No se puede meter dentro de otra página**: es lo que bloquea `x-frame-options` del punto 1; alcanza con verlo ahí.

## Pendiente

- Dominio propio: por ahora se usa el subdominio gratuito de Render. Migrar a un dominio propio más adelante no requiere cambios de código, solo configurar el dominio en Render.
- Ningún dato real de Casa Diaco se sube a este documento ni al repositorio.
