# Modelo conceptual

Este modelo describe conceptos del negocio y sus relaciones. No decide todavía tablas, endpoints ni tecnologías.

```mermaid
erDiagram
    ORGANIZACION ||--o{ NEGOCIO : agrupa
    ORGANIZACION ||--o{ USUARIO : registra
    NEGOCIO ||--o{ PRODUCTO : posee
    NEGOCIO ||--o{ CATEGORIA : define
    NEGOCIO ||--o{ UNIDAD_VENTA : define
    NEGOCIO ||--o{ ATRIBUTO : define
    NEGOCIO ||--o{ PRECIO : rige
    NEGOCIO ||--o{ ACCESO_A_NEGOCIO : habilita
    USUARIO ||--o{ ACCESO_A_NEGOCIO : recibe
    ROL ||--o{ ACCESO_A_NEGOCIO : define
    NEGOCIO ||--o{ PROVEEDOR : define

    CATEGORIA ||--o{ PRODUCTO : clasifica
    UNIDAD_VENTA ||--o{ PRODUCTO : mide
    PRODUCTO ||--|{ VARIANTE : ofrece
    ATRIBUTO ||--o{ VALOR_DE_ATRIBUTO : admite
    VALOR_DE_ATRIBUTO }o--o{ VARIANTE : caracteriza
    VARIANTE ||--o{ PRECIO : tiene
    USUARIO ||--o{ PRECIO : registra
    USUARIO ||--o{ OPERACION_AUDITADA : realiza
    PRODUCTO ||--o{ OPERACION_AUDITADA : afecta
    PROVEEDOR ||--o{ PRODUCTO : provee
    PROVEEDOR }o--o{ CATEGORIA : abastece
    VARIANTE ||--o{ FALTANTE : registra
    USUARIO ||--o{ FALTANTE : marca
    NEGOCIO ||--o{ CLIENTE : define
    CLIENTE ||--o{ FIADO : acumula
    USUARIO ||--o{ FIADO : registra

    ORGANIZACION {
        id identificador
        nombre texto
    }
    NEGOCIO {
        id identificador
        nombre texto
        rubro texto
        estado activo_inactivo
    }
    CATEGORIA {
        id identificador
        nombre texto
        estado activo_inactivo
    }
    UNIDAD_VENTA {
        id identificador
        nombre texto
        abreviatura texto
        admite_fraccion si_no
        estado activo_inactivo
    }
    PRODUCTO {
        id identificador
        nombre texto
        estado activo_inactivo
    }
    VARIANTE {
        id identificador
        denominacion texto_opcional
        estado activo_inactivo
    }
    ATRIBUTO {
        id identificador
        nombre texto
        estado activo_inactivo
    }
    VALOR_DE_ATRIBUTO {
        id identificador
        valor texto
        estado activo_inactivo
    }
    PRECIO {
        id identificador
        importe decimal
        vigente_desde fecha_hora
        vigente_hasta fecha_hora_opcional
    }
    USUARIO {
        id identificador
        nombre texto
        estado activo_inactivo
    }
    ROL {
        id identificador
        nombre texto
    }
    ACCESO_A_NEGOCIO {
        id identificador
        estado activo_inactivo
    }
    OPERACION_AUDITADA {
        id identificador
        accion texto
        fecha_hora fecha_hora
        resumen texto
    }
    PROVEEDOR {
        id identificador
        razon_social texto
        contacto texto
        email texto_opcional
        telefono texto_opcional
        ultima_compra fecha_opcional
        estado activo_inactivo
    }
    FALTANTE {
        id identificador
        estado faltante_pedido_recibido
        marcado_en fecha_hora
    }
    CLIENTE {
        id identificador
        nombre texto
        telefono texto_opcional
        estado activo_inactivo
    }
    FIADO {
        id identificador
        tipo cargo_o_pago
        importe decimal
        fecha_hora fecha_hora
    }
```

## Conceptos

### Organización

Titular de uno o más negocios. Es el ámbito al que pertenecen los usuarios; cada negocio tiene su propio catálogo (D-046).

El MVP funcionará con una única organización y un único negocio, creados durante la instalación. El concepto se modela desde el principio porque el historial de precios es inmutable y no podría atribuirse a un negocio de forma retroactiva.

### Negocio

Comercio concreto donde se venden los productos: la mercería, una despensa o una segunda sucursal del mismo rubro. Es el ámbito al que pertenecen el catálogo completo (productos, categorías, unidades de venta, atributos), el precio vigente y, en el futuro, la existencia física, las ventas y las compras.

Dos negocios de la misma organización no comparten catálogo: un producto, su categoría, su unidad de venta o un atributo creados en un negocio no existen ni aparecen en otro, aunque ambos pertenezcan a la misma organización (D-046). Esto es distinto de una organización con un único rubro replicado en varias sucursales, donde sí tendría sentido compartir catálogo entre negocios; ese caso no es el de Casa Diaco (D-039) y no está resuelto por este modelo.

### Categoría

Agrupa productos de un mismo negocio para navegar y organizar el catálogo. Ejemplos iniciales (Mercería): telas, útiles, lanas, agujas y cintas. La lista definitiva se obtendrá de las carpetas reales y depende del rubro de cada negocio — cada negocio define y mantiene su propio conjunto de categorías, sin relación con las de otro negocio de la misma organización.

### Unidad de venta

Indica cómo se expresa el precio: unidad, metro, kilo, paquete, rollo u otra medida. Distingue además si admite cantidades fraccionarias, porque un producto vendido por metro o por kilo podrá registrarse en el futuro con cantidades decimales. Es propia de cada negocio (D-046), aunque en la práctica dos negocios puedan terminar creando una unidad con el mismo nombre.

### Producto

Agrupación comercial que sirve para buscar y navegar. Reúne las presentaciones o versiones que la usuaria considera «lo mismo»: una cinta bebé N.º 2 con sus colores, o una gaseosa con sus tamaños.

El producto no lleva precio por sí mismo: lo llevan sus variantes.

### Variante

**Unidad vendible.** Es lo que efectivamente se vende, se cotiza y, en el futuro, se cuenta y se escanea: la cinta bebé N.º 2 roja, la gaseosa de 1,5 litros, el cuaderno tapa dura de 48 hojas.

Todo producto tiene al menos una variante. Cuando un producto no presenta diferencias reales, su única variante es implícita: la usuaria crea y edita el producto sin percibir este nivel, y la aplicación no le pide datos adicionales.

La variante es el concepto que sostiene los tres objetivos futuros del sistema, porque todos describen la misma cosa física:

- el precio, que puede diferir entre presentaciones de un mismo producto;
- la existencia en inventario, que se cuenta por unidad concreta;
- el código de barras, que identifica una presentación y no una agrupación.

Cuando varias variantes comparten precio, como suele ocurrir con los colores de una misma cinta, la aplicación permitirá fijarlo para todas ellas en una sola operación. Compartir el precio es una comodidad de la interfaz, no una restricción del modelo.

### Atributo y valor de atributo

Característica normalizada con la que se distingue una variante, junto con la lista cerrada de valores que admite. Es propia de cada negocio (D-046): el atributo `color` y sus valores precargados existen por separado en cada negocio que los usa. Una usuaria autorizada puede agregar valores y, más adelante, atributos aplicables a otros rubros, como marca, sabor o presentación.

Los valores no se escriben libremente en cada variante. Eso evita diferencias como `Rojo`, `rojo` y `ROJO`, y hace que incorporar un rubro nuevo sea una carga de datos y no una modificación del sistema.

Las características que no necesiten integridad ni filtros frecuentes podrán seguir describiéndose como texto dentro del producto.

### Precio

Registro temporal del precio final al público de una variante en un negocio. El importe es siempre positivo y se expresa exclusivamente en ARS. El registro sin fecha de finalización es el vigente. Los precios anteriores no se borran ni modifican durante la operación normal.

Una misma variante puede tener precios distintos en dos negocios de la misma organización.

### Usuario, rol y acceso

Identifican a toda persona que accede al sistema y determinan sus permisos. Los roles son Empleado, Gerente, Administrador y Dueño (D-045); no existe consulta pública del catálogo.

El acceso se otorga sobre un negocio: una persona puede trabajar en un negocio, en varios o en todos los de la organización. Quien accede a más de uno podrá ver la información consolidada. En el MVP, con un único negocio, todas las cuentas acceden a él.

### Operación auditada

Registro de una acción relevante, como crear, editar, desactivar o importar. Complementa el historial específico de precios.

### Proveedor

Comercio o persona a quien se le compra mercadería para un negocio (no se comparte entre negocios de la misma organización, igual que el resto del catálogo, D-046). Guarda razón social, nombre de contacto, email, teléfono, la fecha de la última compra y las categorías que provee (para poder agrupar una lista de faltantes por proveedor). Un producto tiene un único proveedor habitual.

### Faltante

Marca que una variante necesita reponerse. La pone cualquier Usuario con sesión activa, sobre la variante (no el producto: es lo que efectivamente se repone). No registra cantidad, solo que falta. Tiene tres estados posibles: **Faltante** (recién marcado) → **Pedido** (ya se le avisó al proveedor) → **Recibido** (llegó y se cierra). Sostiene el "recordatorio": una lista de faltantes pendientes, agrupable por proveedor o categoría, y un contador visible en la navegación para quien tenga permiso de verla.

### Cliente y fiado

Cliente: persona a la que se le puede fiar (vender a crédito). Pertenece al negocio, igual que el resto del catálogo. Guarda nombre y, si se conoce, un teléfono de contacto.

Fiado: movimiento de la cuenta corriente de un cliente. Es un **cargo** (se llevó algo, aumenta lo que debe) o un **pago** (entregó dinero, disminuye lo que debe), con un importe y una fecha; no desglosa qué productos se llevó, solo el monto (a diferencia de una venta real, que es una extensión de etapas futuras). El saldo de un cliente es la suma de sus cargos menos sus pagos.

## Extensiones futuras previstas (etapas posteriores a la 2)

- Código de identificación de la variante, incluido el código de barras (Etapa 5).
- Cantidad solicitada de un faltante (más allá del MVP de reposición de la Etapa 2).
- Estado de reposición y sus transiciones (más allá de Faltante/Pedido/Recibido).
- Existencia por variante y negocio.
- Movimiento de inventario.
- Venta, detalle de venta y cobro.
- Compra, detalle de compra y pago.
- Costo de adquisición y margen, con visibilidad restringida.

Todas estas extensiones se apoyan en la variante y en el negocio, que por eso se modelan desde el comienzo aunque el MVP no los explote.
