# Seguridad y privacidad

Este documento reúne, en un solo lugar, qué se protege, cómo y de quién es
responsabilidad. No introduce controles técnicos nuevos que no estén ya
implícitos en los requisitos no funcionales y en las decisiones adoptadas;
los traduce y los hace explícitos para que cualquier conversación de tarea
([10-flujo-de-trabajo.md](10-flujo-de-trabajo.md)) los tenga como regla y no
como algo que deba inferir.

## Qué es sensible en este proyecto y qué no

El código y la documentación funcional (documentos 01 a 10) **no son
sensibles por sí mismos**: describen reglas y estructura, no información real
del negocio. Los ejemplos que aparecen (`Cinta bebé N.º 2`, precios de
muestra) son ilustrativos.

Lo sensible es la **información real** que el sistema va a manejar en
producción:

- precios, existencias y ventas reales;
- credenciales de cualquier tipo: contraseñas, claves de la base de datos,
  tokens de servicios externos;
- cualquier dato personal mínimo que se llegara a registrar (nombre de
  usuario de las cuentas, por ejemplo).

Esa información vive en la base de datos de producción y en la configuración
privada del despliegue — nunca en el repositorio de código.

## Qué no se sube nunca al repositorio

- Contraseñas, claves, tokens, cadenas de conexión a la base de datos.
- Archivos `.env` o cualquier archivo de configuración con secretos.
- La muestra real de productos usada para validar el catálogo (DP-001,
  DP-002, DP-003), listas de precios reales, o cualquier exportación de datos
  del negocio.
- Copias de seguridad de la base de datos.

El [`.gitignore`](../.gitignore) del repositorio excluye estas categorías por
defecto. Si una conversación de tarea necesita trabajar con datos de ejemplo,
debe usar datos inventados o una muestra anonimizada, nunca la información
real tal cual.

Un archivo commiteado una vez queda en el historial de git aunque se borre
después; prevenir con el `.gitignore` es más simple que limpiar un historial
ya escrito.

## Controles ya decididos en la documentación funcional

| Control | Dónde está decidido | En qué consiste |
|---|---|---|
| Contraseñas nunca en texto plano | RNF-013 | Se guardan "hasheadas" con un algoritmo reconocido (por ejemplo bcrypt o argon2); ni con acceso directo a la base de datos se puede leer la contraseña real. |
| Toda comunicación cifrada | D-024 | HTTPS sin excepción, también para el acceso remoto desde el celular del dueño. |
| Autorización en el servidor, no en la pantalla | RNF-007, RNF-012 | Cada función de la API valida sesión y permiso por sí misma. Ocultar un botón en la interfaz no reemplaza ese control. |
| Sesiones con vencimiento | RNF-015, D-005 | Vencen solas según una política configurable y se pueden cerrar antes a mano. |
| Acceso acotado por negocio | D-017, RNF-018 | Ninguna consulta expone información de un negocio al que la cuenta activa no tenga acceso. |
| Migraciones controladas, sin ejecución automática de esquema | Sección "Migraciones con Alembic" en 09 | Evita cambios de estructura no revisados en un entorno con datos reales. |
| Copia de seguridad antes de datos reales | DP-005 | Pendiente de elegir el servicio; debe incluir cifrado y acceso restringido a esas copias. |

## Responsabilidades que no dependen del código

Estas medidas no las resuelve la aplicación; dependen de las cuentas y
servicios que use el Responsable del proyecto:

- **Verificación en dos pasos (2FA)** en la cuenta de GitHub y en el servicio
  de hosting elegido (DP-005). Es la medida más simple y de mayor impacto, y
  no depende de ninguna decisión técnica pendiente.
- Mantener el repositorio en **privado** y revisar periódicamente quién tiene
  acceso, si en algún momento se suma un colaborador.
- No compartir la muestra real de productos ni ninguna exportación de datos
  del negocio fuera de un canal privado.

## Checklist de seguridad para la conversación madre

Se suma como paso adicional al checklist de verificación de
[10-flujo-de-trabajo.md](10-flujo-de-trabajo.md#checklist-de-verificación-conversación-madre).
Antes de aprobar una tarea:

1. Confirmar que el diff no incluye contraseñas, claves ni cadenas de
   conexión.
2. Confirmar que no se agregó ningún dato real del negocio como muestra o
   dato de prueba.
3. Si la tarea toca autenticación, sesiones o permisos, verificar
   explícitamente contra RNF-007, RNF-012, RNF-013 y RNF-015, no solo contra
   la descripción de la tarea.
