# Trazabilidad y decisiones pendientes

## Matriz de trazabilidad del MVP

| Necesidad | Requisitos principales | Casos de uso | Historias |
|---|---|---|---|
| Encontrar precios rápidamente | RF-001 a RF-009, RF-035 | CU-01, CU-02 | HU-01, HU-02, HU-03 |
| Mantener un catálogo heterogéneo | RF-010 a RF-017, RF-036, RF-037 | CU-04, CU-05, CU-08, CU-10 | HU-04, HU-08 |
| Conservar cambios de precio | RF-018 a RF-023, RF-038 | CU-06, CU-07 | HU-05 |
| Autenticar y autorizar todo acceso | RF-001, RF-024, RF-025, RF-031, RF-039 | CU-03 | HU-06 |
| Usar varios dispositivos | RF-026, RF-027 | CU-01, CU-04 a CU-06 | HU-01, HU-04, HU-05 |
| Digitalizar las carpetas | RF-028 a RF-030 | CU-09 | HU-07 |
| Normalizar y ampliar atributos | RF-032 a RF-034, RF-040 | CU-08 | HU-09 |
| Admitir presentaciones con precios distintos | RF-019, RF-036, RF-037 | CU-04, CU-05, CU-06 | HU-10 |

## Decisiones adoptadas

| ID | Decisión | Motivo |
|---|---|---|
| D-001 | El primer producto entregable será consulta y gestión de precios. | Resuelve el uso cotidiano principal con un alcance controlable. |
| D-002 | La solución incluirá una interfaz web móvil y una API. | Una API sola no puede ser utilizada directamente por las usuarias. |
| D-003 | Todo acceso al catálogo y a los precios requerirá iniciar sesión. | La información comercial se limita a Usuarios autenticados. |
| D-004 | Cada persona tendrá una cuenta individual con uno de tres roles: Administrador, Gerente o Empleado. | Permite aplicar permisos y atribuir operaciones correctamente, con un nivel intermedio de gestión del catálogo (D-035) entre quien solo consulta y quien es titular del negocio. |
| D-005 | La sesión tendrá un vencimiento configurable y deberá indicar claramente qué cuenta está en uso. La duración exacta será una configuración privada del despliegue. | Limita la permanencia de sesiones abiertas sin publicar parámetros de seguridad. |
| D-006 | El precio pertenece a la **variante**, entendida como unidad vendible. Todo producto tiene al menos una; cuando no hay diferencias reales, es implícita y no se muestra. | Sustituye a la decisión provisional anterior. Ver la justificación extendida más abajo. |
| D-007 | En conflictos simples prevalecerá el último cambio aceptado. | Es una regla comprensible para pocos dispositivos y baja concurrencia. |
| D-008 | La carga inicial se hará mediante una planilla revisable. | Permite usar fotografías e IA externamente sin acoplar esa complejidad al MVP. |
| D-009 | Proveedores, stock, compras y ventas quedan fuera del MVP. | Se incorporarán por etapas después de validar la consulta de precios. |
| D-010 | Los valores de los atributos normalizados se elegirán de listas precargadas que los Usuarios podrán ampliar. | Evita escrituras inconsistentes y permite incorporar valores no previstos. |
| D-011 | Todos los importes se expresarán exclusivamente en ARS. | El sistema no necesita manejar monedas alternativas. |
| D-012 | Los precios serán finales al público y estrictamente mayores que cero. | Representan valores válidos para comunicar al cliente. |
| D-013 | No se registrarán dispositivos ni se asociarán a cuentas para el acceso normal. | La identidad corresponde al Usuario autenticado, no al dispositivo. |
| D-014 | La API se desarrollará con FastAPI. | Se prioriza un enfoque orientado a API y la continuidad con el ecosistema Python para análisis futuros. |
| D-015 | La persistencia principal utilizará PostgreSQL. | El dominio requiere relaciones, restricciones y transacciones fuertes para precios, historial, inventario, compras y ventas. |
| D-016 | Los datos centrales se modelarán mediante relaciones; `JSONB` se reservará para atributos variables cuando resulte necesario. | Mantiene la integridad del dominio sin forzar una estructura idéntica para todos los productos. |
| D-017 | El sistema contemplará una **organización** con uno o más **negocios**. El catálogo pertenece a la organización; el precio y la existencia futura pertenecen al par formado por la variante y el negocio. | Un mismo titular puede tener más de un comercio y querrá ver su información en conjunto. |
| D-018 | El MVP operará con una única organización y un único negocio creados durante la instalación, sin interfaz para administrarlos. | Se incorpora la clave estructural sin agregar funcionalidad ni pantallas al primer alcance. |
| D-019 | El color no será una entidad especial sino el primer **atributo normalizado**. Los atributos y sus valores serán datos. | Un rubro distinto necesita marca, sabor o presentación con el mismo tratamiento; el color no debe quedar fijado en el esquema. |
| D-020 | El código de barras se asociará a la variante, no al producto, y se incorporará en una etapa posterior. | Un código identifica una presentación física concreta, que es la misma unidad que lleva precio y existencia. |
| D-021 | El orden de etapas será precios, reposición, inventario y ventas, identificación por código, varios negocios y análisis. | La reposición resuelve un problema actual y no exige un registro completo de la operación diaria; el inventario exacto sí. |
| D-022 | El inventario y el registro de ventas se incorporarán en la misma etapa. | Un stock que no se descuenta con las ventas se desincroniza en semanas y deja de ser confiable. |
| D-023 | La adaptación a otro rubro se resolverá con categorías, unidades, atributos y datos iniciales, sin modificar el esquema ni el código. | Es la definición operativa de «adaptable a otros rubros» y evita generalizaciones prematuras. |
| D-024 | El sistema es de uso privado: su código y su documentación no se publicarán. La aplicación en funcionamiento sí será alcanzable por internet, protegida con HTTPS y autenticación obligatoria, para permitir la consulta remota de un Usuario autorizado, por ejemplo el dueño desde su celular fuera del negocio. | Privacidad del proyecto y alcance por internet son decisiones independientes: una restringe quién ve el código, la otra determina desde dónde se puede usar la aplicación ya construida. |
| D-025 | La documentación funcional se escribe como una especificación autosuficiente: cualquier persona o asistente de programación debería poder implementar el sistema a partir de estos documentos, sin información adicional no escrita aquí. | El Responsable del proyecto no programará directamente y prevé encargar la implementación a un asistente de IA a partir de esta documentación. |
| D-026 | Se aprueba el conjunto PT-001 a PT-011 de la propuesta arquitectónica: SQLAlchemy 2.x directo con Pydantic separado, persistencia síncrona, Alembic como única vía de migración, monolito modular, sesiones opacas del lado del servidor, y las reglas de integridad de variante y negocio. | Autoriza el inicio de la programación del MVP. El detalle de cada punto y su justificación quedan en el documento 09. |
| D-027 | La interfaz será una aplicación cliente separada (SPA) con TypeScript, que consume la API mediante HTTPS. | Preferencia explícita del Responsable del proyecto, que acepta el costo de mantener dos stacks a cambio de mayor separación entre interfaz y API y de una interacción más rica. |
| D-028 | La recuperación de una contraseña será un restablecimiento realizado por un Administrador, sin correo electrónico. | Evita incorporar infraestructura de correo y datos personales adicionales en un sistema privado de pocos usuarios. Resuelve DP-004; queda pendiente el procedimiento restringido para el caso sin ningún Administrador disponible. |
| D-029 | La implementación se organiza en una conversación madre que aprueba y verifica, y conversaciones de tarea acotadas y separadas que implementan. Cada tarea se integra a `main` solo después de revisarse contra los requisitos que dice cubrir. Ver [10-flujo-de-trabajo.md](10-flujo-de-trabajo.md). | Evita que una conversación única crezca hasta perder precisión, y permite usar un modelo más liviano en tareas ya bien especificadas, reservando el de mayor capacidad para arquitectura y verificación. |
| D-030 | El repositorio será privado. Los documentos funcionales (01 a 10) se versionan normalmente; los secretos, las copias de seguridad y cualquier dato real del negocio quedan excluidos por convención y por `.gitignore`, y nunca se incorporan al historial. Ver [11-seguridad-y-privacidad.md](11-seguridad-y-privacidad.md). | Un repositorio privado protege el código, no reemplaza el resto de los controles; conviene decidir ahora qué nunca se versiona, porque el historial de git no se limpia fácilmente después. |
| D-031 | El código no llevará comentarios; las constantes de dominio se centralizan en un módulo propio, separado de la configuración del despliegue; y una regla de negocio implementada una vez se reutiliza en vez de reescribirse. Ver [12-estandares-de-codigo.md](12-estandares-de-codigo.md). | Preferencia explícita del Responsable del proyecto por un código autoexplicativo, sin valores dispersos y sin duplicación de reglas, para que siga siendo legible y modificable a medida que crezca. |
| D-032 | Ninguna conversación de IA —ni la madre ni una de tarea— ejecuta ningún comando de git que modifique el repositorio, su índice o su historial: ni `git commit`, `git merge`, `git push`, ni tampoco `git add` ni la creación de ramas. Solo puede usar git en modo lectura (`git status`, `git log`, `git diff`, etc.). Las conversaciones dejan los archivos modificados sin agregarlos al índice y sugieren el mensaje de commit en formato Conventional Commits. Ver [10-flujo-de-trabajo.md](10-flujo-de-trabajo.md#los-comandos-de-git-son-siempre-manuales). | El Responsable del proyecto quiere retener el control manual sobre qué queda escrito en el repositorio, sin excepciones caso a caso — incluido el índice de git, no solo el historial. |
| D-033 | La gestión de cuentas (RF-031: alta, baja y modificación de cuentas y roles por un Administrador) se implementa dentro de T-002, junto con autenticación y sesión, en vez de como tarea separada. | RF-031 no tenía tarea asignada en el registro de [10-flujo-de-trabajo.md](10-flujo-de-trabajo.md#registro-de-tareas) ni un CU o HU propios que lo cubrieran; coincide con el módulo "Acceso" de [09-propuesta-arquitectura-tecnica.md](09-propuesta-arquitectura-tecnica.md#módulos-funcionales), que agrupa autenticación y alta de cuentas en el mismo módulo funcional. |
| D-034 | El código (nombres de tablas, columnas, clases, funciones y constantes) se escribe en inglés; los nombres de rol usan la forma genérica en español (Administrador, Gerente, Empleado) en vez de la forma femenina de la redacción original. | El Responsable del proyecto quiere que el sistema sea genérico y reutilizable para ofrecerlo a otros negocios, no solo a la mercería y librería piloto. Esto es independiente de si el sistema se distribuye finalmente a terceros: la tensión con D-024 ("no se ofrecerá como producto a terceros") queda planteada y sin resolver todavía; ver [10-flujo-de-trabajo.md](10-flujo-de-trabajo.md#registro-de-tareas) T-009, que aplicará esta convención al código de T-001 ya mergeado. |
| D-035 | Se incorpora un tercer rol, Gerente, con permisos intermedios entre Empleado y Administrador (RN-032): administra el catálogo y los precios, pero no administra cuentas ni roles ni realiza la importación inicial, reservadas al Administrador. El Empleado deja de poder administrar el catálogo y los precios: su alcance se limita a consultar (RN-009). | Pedido explícito del Responsable del proyecto: un nivel de gestión del negocio (por ejemplo, quien está a cargo de un local) que pueda ajustar precios y datos de productos sin las capacidades administrativas completas —cuentas, importación— reservadas a quien es titular del negocio. |
| D-036 | Una importación con filas inválidas no aplica ninguna fila (política "todo o nada"): el Administrador corrige el archivo completo y vuelve a analizarlo. Resuelve DP-003. La plantilla concreta de columnas (provisional, PT-007) queda definida en [09-propuesta-arquitectura-tecnica.md](09-propuesta-arquitectura-tecnica.md#importación), a falta de una planilla real del negocio piloto. La importación puede dar de alta categorías, unidades y valores de atributo que no existan todavía; los atributos en sí (el tipo, no sus valores) quedan fuera y se gestionan con los endpoints ya existentes de T-003. | Decisión explícita del Responsable del proyecto, sin esperar una planilla real: prefiere la opción más simple y predecible (evita catálogos a medio importar) sobre la de aplicar solo filas válidas. Cada negocio (D-023) puede tener un rubro distinto y arrancar sin catálogo propio: la planilla debe poder ser el punto de partida del catálogo de ese negocio, no solo una carga sobre uno ya curado a mano. |
| D-037 | La tecnología concreta de la SPA (D-027, PT-012) es React con Vite. | Es el ejemplo que ya proponía docs/09; ecosistema y documentación amplios, lo que reduce la ambigüedad al implementarla en conversaciones de tarea separadas. |

### Justificación extendida de D-006

Esta decisión reemplaza la formulación provisional anterior, que dejaba abierta la separación entre producto y variante hasta revisar muestras reales. Se cierra ahora, antes de la muestra, porque los tres objetivos declarados para el futuro del sistema describen la misma unidad física:

- el **precio** puede diferir entre presentaciones de un mismo producto, como los tamaños de una gaseosa;
- la **existencia** se cuenta por unidad concreta: el stock de cinta roja es distinto del de la azul;
- el **código de barras** identifica una presentación, nunca una agrupación comercial.

Mantener el precio en el producto obligaría a migrarlo al incorporar un rubro con presentaciones de distinto valor. Esa migración recae sobre el historial de precios, que por RF-023 es inmutable y no admite reinterpretación retroactiva. El costo de decidirlo ahora es una tabla adicional; el costo de decidirlo después crece con cada mes de historial acumulado.

La muestra real sigue siendo necesaria, pero para una pregunta distinta y reversible: **cuáles** son las variantes de cada producto en este negocio, no **si** el concepto existe.

En la mercería, donde las variantes de un producto suelen compartir precio, la interfaz permitirá fijarlo para todas en una sola operación (RF-038). Que compartan precio es una comodidad de la interfaz, no una restricción del modelo.

### Decisiones sustituidas

Estas decisiones cambiaron de contenido después de adoptadas. Se conserva la formulación anterior para que la revisión del documento sea trazable.

| ID | Formulación anterior | Qué cambió |
|---|---|---|
| D-006 | «Se distinguirán conceptualmente producto y variante, pero su separación técnica definitiva seguirá provisional hasta revisar muestras reales.» | La separación deja de ser provisional y la variante pasa a ser la dueña del precio. Lo provisional pasa a ser el contenido de las variantes de cada producto, que ahora es DP-001. |
| D-010 | «Los colores se elegirán de un catálogo precargado que los Usuarios podrán ampliar.» | El mecanismo se mantiene, pero deja de ser exclusivo del color y se generaliza a cualquier atributo normalizado. Ver D-019. |
| D-032 | «Ninguna conversación de IA ejecuta `git commit`, `git merge` ni `git push`; esos pasos los realiza siempre el Responsable del proyecto. Las conversaciones dejan cambios en stage y sugieren el mensaje de commit en formato Conventional Commits.» | La prohibición se amplía de `commit`/`merge`/`push` a cualquier comando de git que modifique el repositorio, incluidos `git add` y la creación de ramas; antes se permitía dejar los cambios preparados en el índice. |
| D-004 | «Cada persona tendrá una cuenta individual con rol Administradora o Empleada.» | Se agrega el rol Gerente (D-035); los tres nombres de rol pasan a la forma genérica en español (Administrador, Gerente, Empleado) en vez de la femenina, coincidiendo con D-034. |

## Decisiones pendientes antes del diseño técnico

| ID | Pregunta | Cómo resolverla |
|---|---|---|
| DP-001 | ¿Qué variantes tiene realmente cada producto de este negocio y qué las distingue? | Revisar muestras de cintas, telas y útiles. La existencia del concepto ya está decidida en D-006; queda determinar su contenido. |
| DP-002 | ¿Qué categorías y unidades iniciales existen? | Inventariar encabezados y plantillas de las carpetas. |
| DP-005 | Decidido que la aplicación será alcanzable por internet de forma privada (D-024): ¿qué servicio concreto de hosting se usará, con qué costo, y qué estrategia de copias de seguridad se aplicará? | Ambas decisiones serán elegidas por el Responsable del proyecto antes de utilizar datos reales. No se elegirá una plataforma que exija publicar el repositorio para desplegar gratuitamente. |
| DP-006 | ¿Cómo se presenta un producto con varias variantes en la lista de resultados: una fila por variante o una fila por producto que se despliega? | Probar ambas formas con la muestra real y medir cuál responde más rápido una consulta de mostrador. |
| DP-007 | ¿La organización llegará a alojar negocios de titulares distintos o solo los de un mismo dueño? | Solo afecta al nivel de aislamiento exigible. Puede postergarse mientras exista un único titular, pero debe responderse antes de dar acceso a un tercero. |
| DP-008 | ¿Qué formato de precio y unidad necesita un producto pesable, cuyo código de barras puede traer el peso o el importe incorporado? | Postergable hasta la etapa de identificación por código. Solo condiciona que las cantidades futuras admitan decimales, ya previsto en RN-F04. |
| DP-009 | ¿Qué procedimiento restringido permite recuperar el acceso si no queda ningún Administrador disponible? | Definir un procedimiento operativo, fuera de la aplicación normal, antes de usar datos reales. No bloquea el inicio de la programación. |

## Riesgos iniciales

- **Datos inconsistentes en las carpetas:** mitigar con vista previa, validaciones y una importación de ensayo.
- **Agrupación incorrecta de variantes:** mitigar modelando ejemplos reales antes de diseñar la base de datos. El riesgo se redujo, porque ahora una agrupación equivocada se corrige moviendo variantes entre productos y no rehaciendo el historial de precios.
- **Complejidad prematura:** el nivel de variante y la clave de negocio existen desde el comienzo aunque el negocio actual apenas los use. Mitigar manteniéndolos invisibles en la interfaz: un producto sin variantes reales debe crearse y editarse exactamente como si el concepto no existiera.
- **Búsquedas que no reflejen el vocabulario cotidiano:** mitigar observando consultas reales y admitiendo sinónimos más adelante.
- **Uso de una cuenta equivocada:** mitigar mostrando siempre el Usuario activo y ofreciendo un cierre de sesión visible.
- **Historial poco útil para pronósticos:** un historial de precios no alcanza por sí solo; los pronósticos de demanda requerirán ventas, compras o movimientos de stock confiables.
- **Stock que se desincroniza:** mitigar incorporando inventario y ventas en la misma etapa, según D-022.
- **Generalización prematura por el objetivo multi-rubro:** el riesgo de abrir el sistema a otros rubros es diseñar para casos hipotéticos. Mitigar limitando lo que se decide ahora a lo que resulta caro corregir después —dueño del precio, alcance por negocio y atributos como datos— y postergando todo lo demás hasta que exista un segundo rubro real.

## Próxima validación recomendada

Antes de diseñar la arquitectura o programar, tomar una muestra de aproximadamente 20 a 30 artículos que incluya:

- cintas con tipo, número y color;
- telas vendidas por metro;
- útiles vendidos por unidad o paquete;
- productos con nombres similares;
- al menos un producto cuyas versiones no valgan lo mismo, si existiera en el negocio, para verificar el precio por variante;
- filas con importe ausente, dudoso o no positivo para verificar que la importación las rechace;
- al menos dos cambios históricos de precio, si estuvieran disponibles.

Con esa muestra se podrán cerrar DP-001, DP-002 y DP-006, y ajustar la plantilla de importación provisional (D-036, PT-007).
