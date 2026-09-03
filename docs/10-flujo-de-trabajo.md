# Flujo de trabajo entre conversaciones

Este documento define cómo se organiza la programación del sistema entre
varias conversaciones de un asistente de IA, para sostener el proyecto en el
tiempo sin que una única conversación crezca tanto que pierda precisión, y sin
gastar en un modelo costoso lo que puede resolver uno más liviano.

## Idea general

- **Conversación madre:** sostiene el estado del proyecto. Aprueba decisiones,
  revisa el trabajo terminado y decide si está listo para integrarse a
  `main`. No implementa tareas grandes por sí misma.
- **Conversación de tarea:** conversación nueva y acotada a una sola tarea.
  Parte de esta documentación —no necesita el historial de la madre— y termina
  dejando los cambios listos para revisar.

Esto funciona porque los documentos 01 a 09 son una especificación
autosuficiente (D-025): cualquier conversación nueva tiene ahí todo lo que
necesita para implementar una tarea sin que nadie se la explique de nuevo.

## Los comandos de git son siempre manuales

Ninguna conversación de IA —ni la madre ni una de tarea— ejecuta un comando
de git que modifique el repositorio, su índice o su historial, en ningún
caso: ni `git commit`, `git merge`, `git push`, ni tampoco `git add` ni la
creación de ramas. Es el Responsable del proyecto quien decide qué queda
escrito en el repositorio y quién lo escribe.

Una conversación de IA puede:

- modificar archivos, sin agregarlos al índice de git;
- redactar el mensaje de commit sugerido, para copiar y pegar;
- leer el estado del repositorio con comandos que no lo modifican, como
  `git status`, `git log`, `git diff` o `git show`.

Una conversación de IA no ejecuta, bajo ninguna circunstancia, ningún
comando que cambie el repositorio —tampoco `git add` ni crear una rama—
aunque el pedido del Responsable del proyecto parezca implicar permiso
("fijate si quedó bien", "subilo", "dejalo preparado"). Si hace falta alguno
de esos pasos, se lo pide de forma explícita e inequívoca en ese momento
puntual, y aun así esta regla del proyecto prevalece: el paso lo ejecuta el
Responsable.

## Formato del mensaje de commit sugerido

Toda conversación redacta el mensaje que sugiere siguiendo **Conventional
Commits**, en inglés (mismo criterio que el código, D-031):

```
<tipo>: <descripción breve, en imperativo>

<cuerpo opcional: requisitos que cubre y tarea>
```

Tipos más usados en este proyecto:

| Tipo | Cuándo |
|---|---|
| `feat:` | una funcionalidad nueva |
| `fix:` | corrige un comportamiento incorrecto |
| `refactor:` | cambia la estructura interna sin cambiar el comportamiento |
| `test:` | agrega o modifica pruebas |
| `docs:` | cambios en `docs/` |
| `chore:` | mantenimiento: dependencias, configuración, migraciones |

Ejemplo:

```
feat: add transactional price update for a single variant

Implements RF-018, RF-019, RF-020, RN-005, RN-006 (T-004).
```

## Convención de ramas

- Cada tarea vive en su propia rama, con nombre en inglés como el resto del
  código (D-031): `task/<id>-<short-description>`, por ejemplo
  `task/T-003-add-product`. La crea siempre el Responsable del proyecto
  antes de empezar; una conversación de IA nunca la crea por su cuenta.
- Al terminar, la conversación de tarea deja: los archivos modificados sin
  agregar al índice de git, el mensaje de commit sugerido, y su fila
  actualizada en el [registro de tareas](#registro-de-tareas) más abajo, con
  estado `Lista para revisión`.
- Una conversación de tarea escribe en la columna "Resultado de
  verificación" únicamente su propio resumen (qué hizo, qué pruebas corrió,
  qué ambigüedades resolvió). Nunca escribe un veredicto ni las palabras
  "Aprobada", "Verificada" ni "Revisado por la madre": eso lo determina
  exclusivamente la conversación madre, después de revisar por su cuenta —
  no antes, y no aunque la propia tarea esté segura de haber hecho todo
  bien.

## Plantilla para abrir una conversación de tarea

Copiar y completar al iniciar una conversación nueva:

```
Estoy trabajando en un proyecto de gestión de negocio (catálogo y precios,
con el resto del alcance en docs/01-vision-y-alcance.md) documentado en
docs/. El primer negocio real es una mercería y librería, pero el sistema
está pensado para adaptarse a otros rubros sin cambiar el código (D-023):
evitá cualquier supuesto específico de mercería fuera de los datos de
ejemplo.
Quiero que implementes la tarea T-XXX: <descripción corta>.

Leé antes de empezar:
- docs/09-propuesta-arquitectura-tecnica.md (arquitectura aprobada)
- docs/07-modelo-conceptual.md (modelo de datos)
- Los requisitos y reglas puntuales: <RF-XXX, RN-XXX, HU-XXX>

Alcance de esta tarea: <qué entra y qué explícitamente no entra>

Instrucciones:
1. Trabajá sobre la rama task/T-XXX-<description> (ya creada por mí). Si no
   existe todavía, pedime que la cree antes de avanzar; vos no la crees.
2. Implementá solo lo necesario para esta tarea.
3. Agregá pruebas cuando corresponda.
4. Dejá los archivos modificados sin agregarlos al índice de git (sin `git
   add`) y redactá el mensaje de commit sugerido en formato Conventional
   Commits (feat:, fix:, docs:, etc., ver docs/10-flujo-de-trabajo.md). No
   ejecutes ningún comando de git que modifique el repositorio —tampoco
   `git add`— bajo ninguna circunstancia: esos pasos los hago yo. Podés usar
   git solo para leer (`git status`, `git diff`, `git log`).
5. Al terminar, actualizá tu fila en la tabla de docs/10-flujo-de-trabajo.md
   con estado "Lista para revisión", el mensaje de commit sugerido, y un
   resumen breve de qué archivos tocaste y qué quedó pendiente, si algo. No
   escribas un veredicto ni las palabras "Aprobada", "Verificada" ni
   "Revisado por la madre": eso lo decide únicamente la conversación madre,
   después de revisar por su cuenta.

No hace falta que expliques cada paso intermedio; al final alcanza con el
resumen del punto 5.
```

## Checklist de verificación (conversación madre)

Para cada tarea en estado `Lista para revisión`:

1. Leer el diff de la rama contra `main`.
2. Confirmar que solo tocó lo que la tarea pedía.
3. Contrastar el código contra los RF, RN, CU o HU referenciados — que cumpla
   la regla realmente, no solo que el nombre de una función lo sugiera.
4. Correr las pruebas si existen.
5. Aplicar además el checklist de seguridad de
   [11-seguridad-y-privacidad.md](11-seguridad-y-privacidad.md#checklist-de-seguridad-para-la-conversación-madre)
   y el de [12-estandares-de-codigo.md](12-estandares-de-codigo.md#verificación).
6. Si está bien: avisar al Responsable del proyecto que la tarea está lista
   para commitear y mergear a `main`, con el mensaje de commit sugerido. La
   madre marca la tarea `Verificada` con la fecha una vez que el Responsable
   confirma que lo hizo.
7. Si falta algo: dejarla en `Necesita ajustes` con el detalle puntual, para
   resolverlo en una conversación nueva o en la misma.

## Qué modelo usar en cada conversación

- **Madre:** el modelo de mayor capacidad de razonamiento disponible, porque
  decide arquitectura y es la última revisión antes de integrar código.
- **Tarea:** alcanza con un modelo más liviano o el modo rápido cuando la
  tarea está bien acotada y la especificación es explícita. Reservar el modelo
  más capaz para tareas ambiguas o de alto riesgo: transacciones de precio,
  permisos, migraciones.

## Registro de tareas

Tabla viva. Cada conversación de tarea agrega o actualiza su propia fila; la
madre la revisa y cierra el estado.

| ID | Descripción | Requisitos | Rama | Estado | Resultado de verificación |
|---|---|---|---|---|---|
| T-001 | Esqueleto del proyecto: estructura FastAPI, configuración, primera migración de Alembic (organización, negocio, rol, usuario) | D-026, D-017, D-018 | task/T-001-project-skeleton | Verificada (2026-08-28) | Revisado por la madre: checklist de 10/11/12 aplicado, migración y pruebas corridas contra PostgreSQL real de forma independiente. Se corrigieron los comentarios autogenerados por Alembic. Mergeada a main mediante PR #1 (commit 10f6061). |
| T-002 | Autenticación y sesión: login, logout, cuenta activa, alta y gestión de cuentas de usuario, rol Gerente (D-035) | RF-024, RF-025, RF-031, CU-03, HU-06, RN-009, RN-032 | task/T-002-authentication-and-accounts | Verificada (2026-08-28) | Revisado por la madre: se corrigió un bug bloqueante (import de roles roto), se completó el pedido de identificadores en inglés y el rol Gerente, checklist de 10/11/12 aplicado, 25 pruebas corridas contra PostgreSQL real de forma independiente. Mergeada a main (commit 3a9b847). Pendiente no bloqueante: el token de sesión se guarda sin hashear como clave primaria de `sesion` (a diferencia de la contraseña, RNF-013); queda anotado para revisar más adelante. |
| T-003 | Catálogo: categorías, unidades, atributos y valores, productos y variantes (alta y edición) | RF-010 a RF-017, RF-032 a RF-037, RF-040, CU-04, CU-05, CU-08, HU-04, HU-09 | task/T-003-catalog | Verificada (2026-09-02) | Revisado por la madre: checklist de 10/11/12 aplicado, 43 pruebas corridas contra PostgreSQL real de forma independiente, sin drift de `alembic check`. Mergeada a main (commit 9740103). Encontré y corregí tres cosas antes de aprobar: (1) faltaba actor/fecha en toda operación de catálogo pese a que HU-04 lo exige — agregué `created_by_account_id`/`created_at`/`updated_by_account_id`/`updated_at` (mixin `AuditedMixin`) a las 6 tablas nuevas y los propagué por dominio y API; (2) `add_variant` convertía la variante implícita en "real" sin pedirle nombre, dejando una variante sin forma de distinguirla — ahora exige nombrarla primero con `update_variant`; (3) al corregir lo anterior encontré un bug real de caché de SQLAlchemy (`product.variants` quedaba desactualizado dentro de la misma sesión tras crear una variante) y lo arreglé con `db.expire`. Reescribí el test afectado y agregué cobertura para los tres casos. Corregí también un detalle de formato (`ruff format`) y un acento faltante en los valores de color sembrados ("Marrón"). |
| T-004 | Precios: precio vigente, cambio transaccional individual y por producto, historial | RF-018 a RF-023, RF-027, RF-038, CU-06, CU-07, HU-05, HU-10 | task/T-004-pricing | Verificada (2026-09-02) | Revisado por la madre (después de mergeada — ver nota): checklist de 10/11/12 aplicado, 61 pruebas re-corridas de forma independiente contra PostgreSQL real, sin drift de `alembic check`. Sin correcciones necesarias; confirmo las tres ambigüedades anotadas abajo como resoluciones razonables. Mergeada a main (commit 71472be). Modelo `Price` (`backend/app/db/models/price.py`) con `amount` decimal exacto (`Numeric(12,2)`, nunca float), `effective_from`/`effective_to` y `created_by_account_id`/`created_at` (sin `updated_*`: un precio nunca se edita, ver nota de ambigüedad). Restricciones en PostgreSQL: `CHECK (amount > 0)` e índice único parcial sobre `(variant_id, business_id)` donde `effective_to IS NULL`, ambas ejercitadas contra PostgreSQL real (no solo validadas por la API). Migración `6a07f9b29396_add_pricing.py`, sin drift de `alembic check`. Dominio `backend/app/domain/pricing/{prices.py,errors.py}`: `change_variant_price` (RF-018 a RF-021, RN-003 a RN-006) y `change_product_price` (RF-038, aplica a todas las variantes activas del producto) comparten la misma rutina interna de cierre+alta (`_apply_price_change`), aplicada en bucle dentro de una sola transacción para el caso por producto (D-031, sin reimplementar la lógica). Conflicto optimista (CU-06 A2, RF-027): cada cambio recibe el id del precio vigente que la usuaria vio (`null` si no vio ninguno); si no coincide con el vigente real, se rechaza con 409 y el valor actual en vez de aplicarlo a ciegas; para el cambio por producto la detección considera el conjunto y devuelve el estado de todas las variantes activas (CU-06 A3). Atomicidad verificada con un caso que fuerza una falla a mitad del bucle (segunda variante) y confirma que ninguna queda con el precio nuevo, además del caso natural donde una variante desactualizada rechaza la operación completa. Endpoints en `backend/app/api/pricing.py`: `GET/PUT /variants/{id}/price` (vigente/cambio), `GET /variants/{id}/prices` (historial de solo lectura, RF-022, RF-023, CU-07), `PUT /products/{id}/price` (cambio por producto); lectura con `get_current_user` (RN-009, cualquier rol autenticado), cambios con `require_role(Administrador, Gerente)` (RN-032). 18 pruebas nuevas en `backend/tests/test_pricing.py` corridas contra PostgreSQL real (contenedor Docker efímero, sin `docker-compose` en el repo) junto con las 43 previas, 61 en total, sin regresiones. Ambigüedades menores resueltas y anotadas para revisión: (1) `AuditedMixin` no se reutilizó tal cual porque exige `updated_by`/`updated_at` NOT NULL, que el precio no necesita (RF-023); en su lugar declaré `created_by_account_id`/`created_at` directamente en el modelo, mismo patrón que ya usa `AccountSession`. (2) El "precio que la usuaria vio" (arquitectura, sección Cambio de precio) lo interpreté como el id de fila del precio vigente que el cliente consultó por última vez (no el importe), porque dos cambios distintos podrían coincidir en el mismo importe sin ser el mismo evento. (3) No agregué columna de moneda: RN-023 fija ARS para todo el sistema, no varía por registro. Pendiente no bloqueante: al escribir las pruebas encontré que `TestClient` (httpx) persiste cookies entre pedidos del mismo cliente; una prueba que primero inicia sesión y luego simula "sin sesión" debe limpiar `client.cookies` explícitamente o el pedido queda autenticado igual — no es un bug de producción, solo una trampa a tener en cuenta al escribir pruebas nuevas. |
| T-005 | Búsqueda y consulta | RF-002 a RF-009, RF-035, CU-01, CU-02, HU-01, HU-02, HU-03 | task/T-005-search | Verificada (2026-09-02) | Revisado por la madre: checklist de 10/11/12 aplicado, 72 pruebas re-corridas de forma independiente contra PostgreSQL real, sin observaciones de `ruff`. Mergeada a main (commit 10cfd1b). Coincido con las cuatro ambigüedades resueltas abajo, incluida la decisión de filtrar en Python en vez de SQL — la evalué por mi cuenta antes de leer la justificación y llegué a la misma conclusión (doc09 no pide optimizar sin evidencia, y la escala actual no lo amerita). Resumen de la tarea: endpoint `GET /search` (`backend/app/api/search.py`), lectura con `get_current_user` (RN-009, cualquier rol autenticado); parámetros de consulta `q` (términos libres, opcional) y `category_id` (opcional). Dominio `backend/app/domain/catalog/search.py`, función `search_variants`: filtra variantes activas de productos activos de la organización (RF-009), opcionalmente por categoría (RF-006, valida que exista y responde 404 si no), aplica semántica `AND` entre términos (doc09) sobre un texto derivado del nombre de producto, la categoría, el label de la variante y sus valores de atributo, normalizado con el `normalize_for_comparison` ya existente de T-003 (RF-004, RF-005, D-031: no se reimplementa), y descarta las variantes sin precio vigente en el negocio activo antes de responder (RF-035, RN-028). Agregué `get_current_prices_for_variants` (búsqueda en lote) en `backend/app/domain/pricing/prices.py`, con `_get_current_price` delegando en ella, para no duplicar el filtro de "precio vigente" que ya usa T-004 (D-031). Cada resultado trae `variant_id`, `product_id`, `product_name`, `category_id`, `category_name`, `label`, `attribute_values` (atributo y valor) y `price_amount`, lo mínimo para distinguir resultados (RF-007); sin coincidencias responde 200 con lista vacía, no un error (RF-008). Devuelve una fila por variante, sin agrupar por producto ni resolver DP-006 (queda para T-008, como indica doc09). 11 pruebas nuevas en `backend/tests/test_search.py`: mayúsculas/acentos distintos, orden de términos distinto, término sin coincidencias, variante sin precio vigente excluida, filtro por categoría, categoría combinada con término, producto inactivo excluido, categoría inexistente (404), Empleado puede buscar (RN-009), sin sesión (401), búsqueda sin términos lista todo lo disponible. 72 pruebas en total (61 previas + 11 nuevas) corridas contra PostgreSQL real (contenedor Docker efímero, puerto 5433 para evitar un conflicto con un servicio de PostgreSQL nativo en el 5432 y con el rango de puertos excluidos de Windows que bloqueaba el 55432 configurado en `.env`), sin regresiones; `alembic check` sin drift (esta tarea no modifica el esquema, no agrega migración); `ruff check` y `ruff format` sin observaciones. Ambigüedades menores resueltas, para que la madre las revise: (1) forma de la búsqueda: en vez de agregar columnas de texto normalizado a `Product`/`Category`/`Variant.label` (como `AttributeValue.normalized_value` de T-003), traigo las variantes candidatas ya acotadas por SQL (activas, de la organización, filtradas por categoría si corresponde) y aplico el filtro `AND` de términos en Python sobre texto normalizado en el momento; evita una migración y tocar los flujos de escritura del catálogo (fuera de alcance) y no reimplementa la normalización en SQL sin la extensión `unaccent` (no habilitada); doc09 deja la forma exacta pendiente de la muestra real, y a esta escala no debería ser un problema, pero si la muestra real lo exige, columnas normalizadas o `unaccent` son el paso siguiente natural. (2) Qué cuenta como "características" buscables (RF-003): sumé `variant.label` a nombre, categoría y atributos normalizados, porque es el texto libre que el dominio ya usa para distinguir variantes sin atributo formal (ejemplo "1.5 litros" de la gaseosa en doc04) y que RN-030 describe como texto libre; sin esto no sería buscable por ese texto. (3) Categoría inexistente en el filtro: devuelve 404 (mismo criterio que `GET /categories/{id}`) para distinguir "filtro inválido" de "sin coincidencias" (RF-008). (4) No agregué paginación: no la piden los RF y evita complejidad prematura; si la muestra real la necesita, es un cambio acotado al endpoint. Sin pendientes no bloqueantes detectados. |
| T-006 | Desactivación y reactivación de productos y variantes | RF-016, CU-10, HU-08 | task/T-006-deactivation | Aprobada, pendiente de commit/merge | Revisado por la madre: checklist de 10/11/12 aplicado, 79 pruebas re-corridas de forma independiente contra PostgreSQL real, sin drift de `alembic check`, sin observaciones de `ruff`. Sin correcciones; coincido con las tres ambigüedades resueltas abajo. Mensaje de commit sugerido: `feat(T-006): add deactivation and reactivation for products and variants` / cuerpo: `Implements RF-016, RN-011, RN-012, CU-10, HU-08 (T-006).`. No hizo falta migración: se reutilizan `status` y `updated_by_account_id`/`updated_at` (`AuditedMixin`) que `Product` y `Variant` ya tienen desde T-003. Agregué a `backend/app/domain/catalog/products.py` cuatro funciones (`deactivate_product`, `reactivate_product`, `deactivate_variant`, `reactivate_variant`) que reutilizan `get_product`/`get_variant` existentes y comparten un helper privado `_set_status` para no repetir la asignación de `status`/`updated_by_account_id`/`updated_at` cuatro veces. Cuatro endpoints nuevos en `backend/app/api/catalog.py`: `POST /products/{id}/deactivate`, `POST /products/{id}/reactivate`, `POST /variants/{id}/deactivate`, `POST /variants/{id}/reactivate`, todos con `require_role(ADMINISTRADOR, GERENTE)` (RN-032, mismo criterio que el resto de T-003) y `require_csrf`; devuelven 404 (`ProductNotFound`/`VariantNotFound`) si no existen. No reimplementé la cascada de CU-10 ("desactivar un producto retira también sus variantes de las consultas"): ya está resuelta por el filtro doble de T-005 (`backend/app/domain/catalog/search.py`, `Product.status == ACTIVE` Y `Variant.status == ACTIVE`), así que desactivar el producto no toca el `status` de sus variantes. 7 pruebas nuevas en `backend/tests/test_catalog.py`: desactivar producto oculta sus variantes de `/search` sin cambiar el `status` individual de cada variante, reactivar producto lo vuelve a mostrar en la búsqueda, desactivar una variante no afecta a las demás del mismo producto, reactivar una variante, Gerente puede desactivar y reactivar un producto (RN-032), Empleado no puede desactivar ni un producto ni una variante (403, RN-009), y que la desactivación deja registrados `updated_by_account_id`/`updated_at` del actor. 79 pruebas en total (72 previas + 7 nuevas) corridas contra PostgreSQL real (contenedor Docker efímero, puerto 5433, mismo criterio que T-005), sin regresiones; `alembic check` sin drift (no hay migración nueva); `ruff check` y `ruff format` sin observaciones. Ambigüedades menores resueltas, para que la madre las revise: (1) forma de los endpoints: elegí acciones explícitas `POST .../deactivate` y `POST .../reactivate` en vez de agregar `status` como campo editable a `PATCH /products/{id}` o `PATCH /variants/{id}`, porque CU-10 describe un paso explícito de "solicita cambiar el estado" con confirmación propia, separado de la edición de nombre/categoría/unidad/label/atributos que ya cubren esos PATCH; también evita mezclar semánticas (un PATCH parcial con `status` se presta a activar/desactivar como efecto secundario de una edición no relacionada). (2) Idempotencia: desactivar un producto o variante ya inactivo (o reactivar uno ya activo) no lanza error, simplemente vuelve a fijar el estado y actualiza `updated_by_account_id`/`updated_at`; ningún documento pide bloquear la operación en ese caso y tratarla como no-op parece la resolución más simple. (3) La respuesta de los endpoints de variante devuelve `VariantResponse` (no `VariantCreationResponse` con `possible_duplicates`) porque desactivar/reactivar no cambia `label` ni atributos, así que no corresponde volver a evaluar duplicados. Sin pendientes no bloqueantes detectados. |
| T-007 | Importación por CSV/Excel | RF-028 a RF-030, CU-09, HU-07 | — | Pendiente | — |
| T-008 | Interfaz (SPA): pantallas de las tareas anteriores | Todas las HU | — | Pendiente | — |
| T-009 | Renombrar a inglés los identificadores de código de T-001 ya mergeado (tablas, columnas, clases: Organizacion, Negocio, Rol, Usuario y sus campos), con la migración correspondiente | D-034 | task/T-009-rename-to-english | Verificada (2026-09-02) | Revisado por la madre: checklist de 10/11/12 aplicado, 26 pruebas corridas contra PostgreSQL real de forma independiente, incluida una prueba dedicada que corre la migración de renombrado sobre un esquema con datos existentes (no solo desde vacío) y su downgrade. Evitó los dos choques de nombre previsibles (usuario→"account", no "user"; sesión→"account_session", no "Session"). Mergeada a main (commit 12efd0a). Pendientes no bloqueantes: `ROLES_INICIALES`/`INITIAL_ROLES` se sigue importando en vivo desde la migración de T-001 en vez de usar valores literales (inconsistente con el resto de la migración, que sí quedó con literales); un `RuntimeError` interno sigue en español. |

El orden sigue el propuesto en [06-historias-y-aceptacion.md](06-historias-y-aceptacion.md#orden-sugerido-del-mvp), salvo T-009, que depende de que T-002 esté mergeada y puede intercalarse cuando convenga.
No es una división rígida: la madre puede partir una fila en tareas más chicas
si conviene, siempre que cada una siga siendo verificable de forma
independiente.
