# Actores y permisos

## Actores

### Usuario

Actor general que representa a cualquier persona autenticada en el sistema. Todo Usuario tiene una cuenta personal y uno de los roles siguientes: Administradora o Empleada.

### Empleada

Puede consultar precios y administrar productos, variantes, categorías, unidades, valores de atributos y precios.

### Administradora

Posee todas las capacidades de la Empleada. Además, administra cuentas y realiza importaciones. En etapas futuras administrará proveedores y tendrá acceso a inventario, compras, ventas e información financiera.

### Sistema

Autentica a los usuarios, aplica permisos, registra el historial, valida importaciones y conserva la información centralizada.

## Alcance de los permisos

Los roles no se ejercen sobre el sistema completo sino sobre un **negocio**. Una cuenta puede tener acceso a un negocio, a varios o a todos los de su organización, y su rol podría ser distinto en cada uno.

En el MVP existe un único negocio, de modo que toda cuenta activa accede a él y este nivel no aparece en la interfaz. El alcance se define ahora porque condiciona cómo se atribuye la información desde el primer día.

Cuando existan varios negocios, quien tenga acceso a más de uno podrá consultar su información en conjunto. No se prevé un rol adicional para eso: la vista consolidada será una consecuencia del alcance de la cuenta, no un permiso separado.

## Decisión de acceso para el MVP

Toda persona debe iniciar sesión antes de acceder al catálogo o consultar precios.

Cada persona utilizará una cuenta individual con nombre de usuario y contraseña. Las sesiones vencerán según una política de seguridad configurable y, al vencer, deberá iniciarse sesión nuevamente. Todas las operaciones se atribuirán a la cuenta activa. La aplicación deberá identificar claramente qué Usuario se encuentra activo y permitir cerrar sesión antes del vencimiento.

Una contraseña se recupera mediante un restablecimiento realizado por una Administradora, sin correo electrónico (D-028). Queda pendiente definir el procedimiento restringido para el caso en que no quede ninguna Administradora disponible (DP-009).

## Matriz de permisos del MVP

| Acción | Empleada | Administradora |
|---|---:|---:|
| Iniciar sesión y cerrar sesión | Sí | Sí |
| Buscar y consultar precios | Sí | Sí |
| Navegar por categorías | Sí | Sí |
| Consultar historial de precios | Sí | Sí |
| Crear y modificar productos y sus variantes | Sí | Sí |
| Cambiar precios | Sí | Sí |
| Administrar categorías, unidades y valores de atributos | Sí | Sí |
| Desactivar o reactivar productos y variantes | Sí | Sí |
| Importar el catálogo inicial | No | Sí |
| Administrar cuentas y roles | No | Sí |

## Permisos previstos para etapas futuras

| Información o acción | Empleada | Administradora |
|---|---:|---:|
| Registrar faltantes | Sí | Sí |
| Consultar listas de compra | Según definición futura | Sí |
| Administrar proveedores | No | Sí |
| Registrar ventas | Sí | Sí |
| Consultar cantidades de inventario | Según definición futura | Sí |
| Consultar ingresos, egresos y márgenes | No | Sí |
| Administrar permisos | No | Sí |
| Definir atributos normalizados nuevos | Según definición futura | Sí |
| Administrar códigos de barras de una variante | Sí | Sí |
| Crear y configurar negocios de la organización | No | Sí |
| Otorgar acceso de una cuenta a un negocio | No | Sí |
| Consultar información consolidada de varios negocios | Solo los negocios habilitados | Solo los negocios habilitados |

Los permisos futuros expresan la intención actual, pero no forman parte del MVP.
