# Actores y permisos

## Actores

### Usuario

Actor general que representa a cualquier persona autenticada en el sistema. Todo Usuario tiene una cuenta personal y uno de los roles siguientes: Empleado, Gerente, Administrador o Dueño.

Los tres primeros roles operan siempre sobre un único negocio (el que tenga cada acceso, D-023); solo Dueño puede tener acceso a más de uno y elegir con cuál trabajar (D-045).

### Empleado

Puede buscar y consultar precios, navegar el catálogo por categoría, ver el historial de precios y registrar ventas (etapa futura). No administra el catálogo: crear o modificar productos y variantes, cambiar precios, administrar categorías, unidades y atributos, y desactivar o reactivar productos quedan reservados a Gerente y superiores.

### Gerente

Posee todas las capacidades del Empleado. Además, administra el catálogo y los precios: crea y modifica productos y variantes, cambia precios, administra categorías, unidades y valores de atributos, desactiva o reactiva productos y variantes, y gestiona el inventario (etapa futura). No administra cuentas ni roles, ni realiza la importación inicial, ni ve el Panel: esas acciones quedan reservadas a Administrador y superiores.

### Administrador

Posee todas las capacidades del Gerente. Además, ve el Panel, administra proveedores (etapa futura), administra cuentas y roles, y realiza importaciones. Opera sobre un único negocio: no elige con cuál trabajar, aunque tenga acceso a más de uno (queda fijo al de menor id, D-044/D-045).

### Dueño

Posee todas las capacidades del Administrador. Es el único rol que puede tener acceso a más de un negocio de la organización y elegir con cuál trabajar mediante el selector de negocio (D-045). La cuenta inicial que el sistema crea al arrancar tiene este rol. En etapas futuras tendrá acceso a compras, ventas e información financiera consolidada de todos sus negocios.

### Sistema

Autentica a los usuarios, aplica permisos, registra el historial, valida importaciones y conserva la información centralizada.

## Alcance de los permisos

Los roles no se ejercen sobre el sistema completo sino sobre un **negocio**. Una cuenta puede tener acceso a un negocio, a varios o a todos los de su organización, y su rol podría ser distinto en cada uno.

En el MVP existe un único negocio, de modo que toda cuenta activa accede a él y este nivel no aparece en la interfaz. El alcance se define ahora porque condiciona cómo se atribuye la información desde el primer día.

Cuando existan varios negocios, quien tenga acceso a más de uno podrá consultar su información en conjunto. No se prevé un rol adicional para eso: la vista consolidada será una consecuencia del alcance de la cuenta, no un permiso separado.

## Decisión de acceso para el MVP

Toda persona debe iniciar sesión antes de acceder al catálogo o consultar precios.

Cada persona utilizará una cuenta individual con nombre de usuario y contraseña. Las sesiones vencerán según una política de seguridad configurable y, al vencer, deberá iniciarse sesión nuevamente. Todas las operaciones se atribuirán a la cuenta activa. La aplicación deberá identificar claramente qué Usuario se encuentra activo y permitir cerrar sesión antes del vencimiento.

Una contraseña se recupera mediante un restablecimiento realizado por un Administrador o Dueño, sin correo electrónico (D-028). Queda pendiente definir el procedimiento restringido para el caso en que no quede ninguna cuenta con ese privilegio disponible (DP-009).

## Matriz de permisos del MVP

| Acción | Empleado | Gerente | Administrador | Dueño |
|---|---:|---:|---:|---:|
| Iniciar sesión y cerrar sesión | Sí | Sí | Sí | Sí |
| Buscar y consultar precios | Sí | Sí | Sí | Sí |
| Navegar por categorías | Sí | Sí | Sí | Sí |
| Consultar historial de precios | Sí | Sí | Sí | Sí |
| Crear y modificar productos y sus variantes | No | Sí | Sí | Sí |
| Cambiar precios | No | Sí | Sí | Sí |
| Administrar categorías, unidades y valores de atributos | No | Sí | Sí | Sí |
| Desactivar o reactivar productos y variantes | No | Sí | Sí | Sí |
| Ver el Panel | No | No | Sí | Sí |
| Importar el catálogo inicial | No | No | Sí | Sí |
| Administrar cuentas y roles | No | No | Sí | Sí |
| Elegir con qué negocio trabajar (D-045) | No | No | No | Sí |

## Permisos previstos para etapas futuras

| Información o acción | Empleado | Gerente | Administrador | Dueño |
|---|---:|---:|---:|---:|
| Registrar faltantes | Sí | Sí | Sí | Sí |
| Consultar listas de compra | Según definición futura | Sí | Sí | Sí |
| Administrar proveedores | No | No | Sí | Sí |
| Registrar ventas | Sí | Sí | Sí | Sí |
| Consultar cantidades de inventario | Según definición futura | Sí | Sí | Sí |
| Consultar ingresos, egresos y márgenes | No | No | No | Sí |
| Administrar permisos | No | No | No | Sí |
| Definir atributos normalizados nuevos | Según definición futura | Sí | Sí | Sí |
| Administrar códigos de barras de una variante | Sí | Sí | Sí | Sí |
| Crear y configurar negocios de la organización | No | No | No | Sí |
| Otorgar acceso de una cuenta a un negocio | No | No | Sí | Sí |
| Consultar información consolidada de varios negocios | No aplica (un negocio) | No aplica (un negocio) | No aplica (un negocio) | Solo los negocios habilitados |

Los permisos futuros expresan la intención actual, pero no forman parte del MVP.
