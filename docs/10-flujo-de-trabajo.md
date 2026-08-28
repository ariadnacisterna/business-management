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
   resumen breve de qué archivos tocaste y qué quedó pendiente, si algo.

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
| T-001 | Esqueleto del proyecto: estructura FastAPI, configuración, primera migración de Alembic (organización, negocio, rol, usuario) | D-026, D-017, D-018 | task/T-001-project-skeleton | Aprobada, pendiente de commit/merge | Revisado por la madre el 2026-08-28: checklist de 10/11/12 aplicado, migración y pruebas corridas contra PostgreSQL real de forma independiente. Se corrigieron los comentarios autogenerados por Alembic (regla sin excepciones). Falta que el Responsable confirme el commit y merge a main para marcar Verificada. |
| T-002 | Autenticación y sesión: login, logout, cuenta activa, alta y gestión de cuentas de usuario | RF-024, RF-025, RF-031, CU-03, HU-06 | — | Pendiente | — |
| T-003 | Catálogo: categorías, unidades, atributos y valores, productos y variantes (alta y edición) | RF-010 a RF-017, RF-032 a RF-037, RF-040, CU-04, CU-05, CU-08, HU-04, HU-09 | — | Pendiente | — |
| T-004 | Precios: precio vigente, cambio transaccional individual y por producto, historial | RF-018 a RF-023, RF-038, CU-06, CU-07, HU-05, HU-10 | — | Pendiente | — |
| T-005 | Búsqueda y consulta | RF-002 a RF-009, RF-035, CU-01, CU-02, HU-01, HU-02, HU-03 | — | Pendiente | — |
| T-006 | Desactivación y reactivación de productos y variantes | RF-016, CU-10, HU-08 | — | Pendiente | — |
| T-007 | Importación por CSV/Excel | RF-028 a RF-030, CU-09, HU-07 | — | Pendiente | — |
| T-008 | Interfaz (SPA): pantallas de las tareas anteriores | Todas las HU | — | Pendiente | — |

El orden sigue el propuesto en [06-historias-y-aceptacion.md](06-historias-y-aceptacion.md#orden-sugerido-del-mvp).
No es una división rígida: la madre puede partir una fila en tareas más chicas
si conviene, siempre que cada una siga siendo verificable de forma
independiente.
