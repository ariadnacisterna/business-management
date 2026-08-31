# Estándares de código

Estas reglas aplican a todo código que se escriba para el proyecto, en
cualquier conversación de tarea ([10-flujo-de-trabajo.md](10-flujo-de-trabajo.md)).
No son preferencias de estilo sueltas: buscan que el proyecto siga siendo
legible y modificable a medida que crezca, sin depender de que quien lo lea
tenga el contexto de por qué se escribió así.

## Sin comentarios en el código

El código se explica por su estructura y por el nombre de sus funciones,
variables y clases — no por comentarios. Si una función necesita un
comentario para entenderse, el problema es el nombre o el tamaño de la
función, y se corrige ahí.

Cuando algo no puede explicarse solo con el código —una decisión de negocio,
una restricción externa, un caso límite no obvio— esa explicación va en
`docs/`, identificada por el requisito o la regla que representa (`RF-XXX`,
`RN-XXX`), no como comentario en el archivo. Esto mantiene una sola fuente de
verdad: la documentación, que ya se escribe para ser autosuficiente (D-025).

Esta regla no incluye las descripciones de campos y de endpoints que expone
la documentación automática de la API (OpenAPI): esas forman parte del
contrato con quien consume la API, no son comentarios internos, y deben
existir.

## Sin valores hardcodeados

Ningún número, texto o umbral fijo se escribe directamente dentro de la
lógica. Se define una sola vez, con un nombre que explique qué representa, y
se importa donde haga falta.

Esto es distinto de los secretos y la configuración del despliegue
(contraseñas, cadenas de conexión, claves), que siempre van por variables de
entorno y nunca se versionan (ver
[11-seguridad-y-privacidad.md](11-seguridad-y-privacidad.md)). La diferencia
es simple: si el valor es el mismo en todos los entornos, es una **constante
de dominio**; si cambia según el despliegue, es **configuración**.

Ejemplos de constantes de dominio de este proyecto: los nombres de los roles
(`Administrador`, `Gerente`, `Empleado`), un límite de longitud de un campo, el nombre
de un estado (`activo`, `inactivo`). Ninguno de estos debería aparecer como
texto suelto repetido en distintos archivos.

## Sin duplicar reglas de negocio

Cuando dos partes del sistema aplican la misma regla, comparten la misma
implementación —una función, una clase base o un módulo común— en vez de
tener dos copias de la misma lógica escritas por separado. Si la regla
cambia, se corrige en un solo lugar.

Ejemplo concreto de este proyecto: cambiar el precio de una sola variante
(RF-018) y cambiar el precio de todas las variantes de un producto (RF-038)
son la misma transacción de cambio de precio; la segunda la repite para cada
variante, no la reimplementa por su cuenta.

Esto no es una licencia para abstraer de más. Si dos fragmentos de código se
parecen pero no representan la misma regla de negocio, se mantienen
separados: unificar solo tiene sentido cuando una corrección futura debería
aplicarse en los dos lugares a la vez. Forzar una base común entre cosas que
solo coinciden por casualidad hace el código más difícil de cambiar, no más
prolijo.

## Estructura del proyecto

La estructura de carpetas refleja los módulos funcionales ya descritos en
[09-propuesta-arquitectura-tecnica.md](09-propuesta-arquitectura-tecnica.md):

```
backend/
  app/
    core/           # configuración, seguridad, sesión de base de datos
    constants/      # constantes de dominio; nunca secretos
    domain/
      access/       # cuentas, sesión, roles
      catalog/      # productos, variantes, categorías, unidades, atributos
      pricing/      # precio vigente, historial
      import_/      # importación de catálogo
      audit/        # operaciones auditadas
    api/            # routers y contratos Pydantic
    db/             # modelos ORM
  alembic/          # migraciones
  tests/
frontend/
  src/
    api/            # cliente HTTP hacia el backend
    features/       # una carpeta por módulo funcional, en espejo del backend
    shared/         # componentes y utilidades comunes
```

Cada módulo de dominio expone casos de uso explícitos y no accede a las
tablas de otro módulo directamente, tal como ya establece la sección "Límite
de una solicitud" de 09. Los nombres de carpetas y archivos se escriben en
inglés, como el resto del código; la documentación del proyecto sigue en
español. Esto es una convención elegida para este documento, no una decisión
que dependa de una preferencia técnica particular; puede cambiarse si no
conviene.

## Nombres en vez de comentarios

Funciones, variables y clases usan nombres que explican su propósito sin
ambigüedad, aunque eso los haga más largos. Un nombre que "necesitaría un
comentario para entenderse" se reemplaza por uno más preciso en lugar de
agregar el comentario.

## Tipado explícito

El backend en Python usa anotaciones de tipo en funciones y modelos; el
frontend en TypeScript evita `any` salvo excepción justificada y documentada
en `docs/`. El tipado reemplaza la documentación que de otro modo iría en
comentarios, y además permite que las herramientas detecten errores antes de
ejecutar el código.

## Formato y análisis estático automáticos

El estilo del código no depende del criterio de cada conversación de tarea:
se fija con un formateador y un linter automáticos (por ejemplo Ruff o Black
para Python, ESLint y Prettier para TypeScript), configurados una sola vez en
la tarea de esqueleto (T-001) y aplicados igual en todas las tareas
siguientes.

## Verificación

Se suma como paso al checklist de
[10-flujo-de-trabajo.md](10-flujo-de-trabajo.md#checklist-de-verificación-conversación-madre).
Antes de aprobar una tarea, la conversación madre confirma:

1. Que no haya comentarios en el código (fuera de las descripciones de la
   API).
2. Que no haya valores hardcodeados fuera del módulo de constantes o de la
   configuración del despliegue.
3. Que ninguna regla de negocio ya implementada en otro módulo se haya
   reescrito en vez de reutilizarse.
