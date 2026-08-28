# Reglas de negocio

## Catálogo

| ID | Regla |
|---|---|
| RN-001 | Cada producto publicable debe pertenecer a una categoría. |
| RN-002 | Cada producto publicable debe indicar cómo se vende: unidad, metro, kilo, paquete, rollo u otra unidad habilitada. |
| RN-016 | Los productos pueden usar conjuntos diferentes de características según el rubro. |
| RN-017 | Para evitar confusiones, dos variantes activas no deberían compartir la misma combinación de nombre y características identificadoras dentro de una categoría. |
| RN-011 | Un producto desactivado deja de aparecer en las consultas normales, pero conserva su historial. |
| RN-012 | La desactivación se prefiere al borrado para preservar trazabilidad y futuras referencias. |
| RN-026 | Todo producto tiene al menos una variante. Cuando no existan diferencias reales, el sistema crea una variante implícita y no la expone en la interfaz. |
| RN-027 | El catálogo pertenece a la organización. Las categorías, unidades, atributos y valores se definen una sola vez y quedan disponibles para todos sus negocios. |

## Precios

| ID | Regla |
|---|---|
| RN-003 | Cada variante tiene un único precio de venta vigente por negocio, independientemente del proveedor. |
| RN-004 | Dos variantes de un mismo producto pueden tener precios iguales o distintos. Cuando comparten precio, el sistema permite fijarlo para todas en una sola operación, pero cada variante conserva su propio registro e historial. |
| RN-005 | Un cambio de precio cierra la vigencia del precio anterior y crea un nuevo registro; no reemplaza el historial. |
| RN-006 | Todo cambio de precio debe identificar a la persona que lo realizó y el momento del cambio. |
| RN-023 | Todos los importes del sistema se expresan exclusivamente en pesos argentinos (ARS). |
| RN-024 | Todo precio representa el valor final al público y debe ser estrictamente mayor que cero. |
| RN-028 | Una variante está disponible en un negocio cuando tiene un precio vigente en ese negocio. Una variante sin precio vigente no aparece en las consultas de ese negocio. |

## Atributos normalizados

| ID | Regla |
|---|---|
| RN-019 | El sistema comienza con el atributo `color` y un conjunto de valores precargados. |
| RN-020 | Un valor nuevo puede ser agregado por un Usuario autorizado y queda disponible para las variantes posteriores. |
| RN-021 | Una variante que utiliza un atributo normalizado debe referirse a un valor activo de su lista; no se escribe como texto libre. |
| RN-022 | No pueden existir dos valores activos equivalentes de un mismo atributo que solo difieran por mayúsculas, minúsculas o acentos. |
| RN-029 | Incorporar un atributo nuevo, como marca o presentación, debe ser una carga de datos y no una modificación del sistema. |
| RN-030 | Las características que no requieran integridad, relaciones ni filtros frecuentes pueden describirse como texto dentro del producto, sin convertirse en atributos normalizados. |

## Acceso y trazabilidad

| ID | Regla |
|---|---|
| RN-007 | Toda consulta de precios requiere una sesión autenticada. |
| RN-008 | Toda operación deberá atribuirse a la cuenta que mantiene la sesión activa. |
| RN-009 | Una Empleada puede administrar productos y precios, pero no puede administrar perfiles ni realizar la importación inicial. |
| RN-010 | Una Administradora puede realizar todas las acciones incluidas en el MVP. |
| RN-018 | Los permisos sobre ingresos, egresos y márgenes serán exclusivos de las Administradoras cuando esas funciones se incorporen. |
| RN-025 | Toda sesión vence según la política de seguridad configurada y el Usuario puede cerrarla antes. |
| RN-031 | El acceso de una cuenta se otorga sobre uno o más negocios de su organización. Una cuenta solo consulta y modifica información de los negocios habilitados para ella. |

## Concurrencia e importación

| ID | Regla |
|---|---|
| RN-013 | La importación no se aplica hasta que una Administradora revise su resumen y la confirme. |
| RN-014 | Si una importación contiene filas inválidas, estas deben identificarse con un motivo comprensible. |
| RN-015 | Si dos dispositivos modifican el mismo dato, se conserva como vigente la última modificación aceptada por el sistema; ambas operaciones auditables deben permanecer registradas cuando corresponda. |

## Ejemplos de producto y variante

Los tres casos siguientes usan la misma estructura y muestran por qué el precio pertenece a la variante.

**Mercería, variantes que comparten precio.**
Producto `Cinta bebé N.º 2`, vendida por metro. Variantes: roja, azul, blanca. Las tres cuestan lo mismo, así que se actualizan juntas en una sola operación. La búsqueda encuentra `cinta bebé 2 roja` y, en el futuro, el stock de la roja podrá ser distinto del de la azul.

**Librería, producto sin variantes reales.**
Producto `Cuaderno tapa dura 48 hojas`, vendido por unidad. Tiene una única variante implícita. La usuaria lo crea y le pone precio como a cualquier producto; el nivel adicional no aparece en la pantalla.

**Despensa, variantes con precios distintos.**
Producto `Gaseosa cola`, con variantes de 500 mililitros, 1,5 litros y 2,25 litros. Cada una tiene su propio precio, tendrá su propio código de barras y su propio stock. Si el precio perteneciera al producto, este caso obligaría a rehacer el historial ya cargado.

## Reglas previstas para etapas futuras

No forman parte del MVP, pero condicionan decisiones que se toman ahora.

| ID | Regla prevista |
|---|---|
| RN-F01 | Un código de barras identificará una variante en particular, nunca un producto, y no podrá repetirse entre variantes activas de la organización. |
| RN-F02 | Una variante podrá tener más de un código de identificación válido. |
| RN-F03 | Cada línea de una venta registrará una copia del importe aplicado en ese momento. Un cambio de precio posterior nunca modificará una venta ya registrada. |
| RN-F04 | Las cantidades de venta y de inventario admitirán decimales cuando la unidad de venta lo permita, como en los productos vendidos por metro o por kilo. |
| RN-F05 | La existencia física se contará por variante y por negocio. |
