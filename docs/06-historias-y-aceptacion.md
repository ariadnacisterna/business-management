# Historias de usuario y criterios de aceptación

## HU-01 — Buscar rápidamente un producto

**Como** persona que atiende el negocio,  
**quiero** buscar un artículo por su nombre o características,  
**para** responder el precio sin revisar carpetas.

### Criterios de aceptación

- Dado un producto activo `Cinta bebé N.º 2` con variante `roja`, cuando se busca `cinta bebe 2 roja`, entonces aparece entre los resultados.
- Dado el mismo producto, cuando se cambian el orden, las mayúsculas o los acentos de los términos, entonces sigue siendo localizable.
- Cuando existen varias coincidencias, cada resultado presenta datos suficientes para elegir correctamente.
- Cuando no existen coincidencias, la aplicación lo informa y permite intentar otra búsqueda.

## HU-02 — Navegar por rubro

**Como** persona que no recuerda el nombre exacto,  
**quiero** navegar por categorías,  
**para** encontrar el producto visualmente.

### Criterios de aceptación

- Las categorías activas pueden abrirse después de iniciar sesión.
- Al seleccionar una categoría solo aparecen sus productos activos.
- Se puede combinar la categoría con términos de búsqueda.

## HU-03 — Consultar el precio vigente

**Como** persona que atiende,  
**quiero** ver claramente el precio vigente,  
**para** comunicárselo al cliente sin ambigüedad.

### Criterios de aceptación

- El precio puede consultarse únicamente con una sesión válida.
- Se muestra como precio final al público en ARS y con un formato legible.
- El precio mostrado es estrictamente mayor que cero.
- Nunca se presentan dos precios simultáneamente como vigentes para la misma variante en el mismo negocio.
- Cuando un producto tiene variantes con precios distintos, el resultado deja claro a cuál corresponde cada importe.
- Ante una falla que impida confirmar el dato vigente, la aplicación muestra un error explícito.

## HU-04 — Mantener productos heterogéneos

**Como** Usuario,  
**quiero** registrar productos con características diferentes según el rubro,  
**para** representar cintas, telas, útiles y otros artículos sin forzar una plantilla única.

### Criterios de aceptación

- Un producto puede crearse con nombre, categoría, unidad y precio.
- Las características adicionales se solicitan únicamente cuando sean aplicables.
- Un producto sin versiones diferenciadas se crea y se edita sin que la interfaz mencione variantes.
- El sistema advierte sobre posibles duplicados antes de confirmar.
- La operación registra a la responsable.

## HU-05 — Actualizar un precio conservando su historia

**Como** Usuario,  
**quiero** actualizar un precio sin perder el anterior,  
**para** mantener información vigente y disponer de datos históricos.

### Criterios de aceptación

- Indico cuánto se suma o se resta al precio vigente (por ejemplo +500 o -200), no el precio final.
- Antes de confirmar se muestran el precio anterior, el resultante y la diferencia con signo.
- Si el resultado quedaría en cero o menos, no se permite confirmar y se explica el motivo.
- Una variante sin precio vigente recibe su precio inicial directamente.
- Al confirmar, el nuevo precio pasa a ser el único vigente.
- El valor anterior continúa disponible en el historial.
- El registro incluye fecha, hora y responsable.
- Una consulta posterior muestra inmediatamente el nuevo precio.
- Dado un producto con varias variantes, cuando se elige aplicar una diferencia a todas, entonces cada una con precio registra su propio cambio; las que no tienen precio no se tocan y se informa cuáles fueron.
- Si la actualización conjunta falla a mitad de camino, o si alguna variante quedaría en cero o menos, no se aplica ningún cambio y se nombran las variantes afectadas.
- Tras confirmar se muestra el precio resultante real, que puede diferir del calculado en pantalla si otra persona cambió antes.

## HU-06 — Proteger el acceso al catálogo

**Como** Administrador,  
**quiero** que solo las personas con una cuenta autorizada puedan ingresar,  
**para** impedir accesos no autorizados al catálogo y a sus funciones.

### Criterios de aceptación

- Al abrir la aplicación sin una sesión válida se muestra el inicio de sesión y no el catálogo.
- Una credencial inválida no permite consultar precios ni habilita la edición.
- Cada persona utiliza una cuenta individual con el rol Empleado, Gerente o Administrador.
- La aplicación identifica claramente qué cuenta está activa.
- Cada cambio queda asociado a un perfil activo.
- La sesión vence según la política de seguridad configurada y luego exige una nueva autenticación.
- El Usuario puede cerrar sesión antes de su vencimiento.

## HU-07 — Cargar el catálogo mediante una planilla

**Como** Administrador,  
**quiero** importar la información preparada desde las carpetas,  
**para** evitar cargar manualmente cientos de productos.

### Criterios de aceptación

- El sistema admite la plantilla acordada en CSV o Excel.
- La revisión ocurre antes de modificar datos reales.
- Los errores indican fila, campo y motivo.
- Los posibles duplicados se distinguen de las filas nuevas.
- Cancelar la revisión no modifica el catálogo.
- La importación confirmada queda auditada.

## HU-08 — Retirar productos sin perder información

**Como** Usuario,  
**quiero** desactivar productos discontinuados,  
**para** que no aparezcan en las consultas sin borrar su historial.

### Criterios de aceptación

- Un producto inactivo no aparece en la búsqueda pública normal.
- Sigue disponible en administración y conserva todos sus precios anteriores.
- Puede reactivarse posteriormente.

## HU-09 — Seleccionar y ampliar valores de atributos

**Como** Usuario,  
**quiero** elegir el color de una lista precargada y agregar los que falten,  
**para** registrar las variantes de forma consistente.

### Criterios de aceptación

- Al crear una variante con color, se puede elegir entre los colores activos precargados.
- El Usuario puede agregar un color que no existe sin abandonar el mantenimiento del producto.
- El color agregado queda disponible para los productos siguientes.
- El sistema impide crear un duplicado que solo difiera por mayúsculas, minúsculas o acentos.
- Desactivar un color impide usarlo en variantes nuevas, pero no altera las variantes existentes.
- El mecanismo es el mismo para cualquier atributo normalizado que se agregue más adelante; el color no recibe un tratamiento especial en el sistema.

## HU-10 — Registrar presentaciones que valen distinto

**Como** Usuario,  
**quiero** que un mismo producto pueda tener versiones con precios diferentes,  
**para** registrar presentaciones o medidas sin duplicar el producto ni perder su agrupación al buscar.

### Criterios de aceptación

- Un producto admite varias variantes, cada una con su propio precio vigente.
- Cambiar el precio de una variante no altera el de las demás.
- La búsqueda encuentra el producto y muestra las variantes que corresponden a los términos ingresados.
- Cada variante conserva su propio historial de precios.
- Una variante sin precio vigente no aparece en las consultas.

Esta historia no es necesaria para la mercería, donde las variantes suelen compartir precio, pero verifica que el modelo admita un rubro como despensa sin rehacer el historial ya cargado.

## HU-11 — Anotar lo que falta sin usar papel

**Como** Usuario,
**quiero** marcar que una variante se está por terminar,
**para** no depender de un cuaderno que se pierde o se olvida hasta la compra siguiente.

### Criterios de aceptación

- Cualquier Usuario con sesión activa puede marcar una variante como faltante, sin necesitar un permiso especial.
- No hace falta indicar cantidad, solo que falta.
- Si la variante ya tiene un faltante abierto, no se crea uno duplicado.

## HU-12 — Ver de un vistazo qué hay que pedir

**Como** Usuario,
**quiero** una lista de los faltantes pendientes, agrupada por proveedor o por categoría,
**para** organizar el pedido sin tener que recorrer todo el catálogo buscando qué falta.

### Criterios de aceptación

- La lista muestra solo los faltantes en estado Faltante o Pedido (los Recibidos ya no aparecen).
- Se puede agrupar por proveedor o por categoría.
- Hay un contador visible en la navegación con la cantidad de faltantes pendientes.

## HU-13 — Llevar el pedido de Faltante a Recibido

**Como** Usuario,
**quiero** marcar cuándo pedí algo al proveedor y cuándo llegó,
**para** saber qué ya está en camino y qué todavía ni pedí.

### Criterios de aceptación

- Un faltante avanza en orden: Faltante → Pedido → Recibido.
- Se puede cancelar un Pedido (volver a Faltante) mientras no llegó.
- Al llegar a Recibido, el faltante se cierra y desaparece de la lista de pendientes.

## HU-14 — Saber a quién llamar

**Como** Usuario,
**quiero** guardar los datos de contacto de cada proveedor y qué categorías provee,
**para** encontrar rápido a quién pedirle cada cosa sin buscar en otro lado.

### Criterios de aceptación

- Un proveedor guarda razón social, nombre de contacto, email, teléfono y las categorías que provee.
- Un producto puede tener asignado un proveedor habitual.
- Un proveedor se desactiva, no se borra, igual que el resto del catálogo.

## HU-15 — Llevar la cuenta de quién fía

**Como** Usuario,
**quiero** anotar cuánto se lleva fiado un cliente y cuánto va pagando,
**para** no depender de un cuaderno y saber cuánto me debe cada uno.

### Criterios de aceptación

- Se puede crear un cliente con nombre y, si se conoce, un teléfono.
- Se puede registrar un cargo (se llevó algo) o un pago, cada uno con un importe.
- El sistema muestra el saldo actual de cada cliente, calculado solo, sin tener que sumarlo a mano.
- No hace falta indicar qué productos se llevó, solo el importe.

## HU-16 — Ver quién me debe

**Como** Usuario,
**quiero** una lista de los clientes con saldo pendiente,
**para** saber a quién recordarle sin repasar cliente por cliente.

### Criterios de aceptación

- La lista muestra solo clientes con saldo mayor a cero.
- Un Gerente o superior puede entrar a un cliente y ver el detalle de sus cargos y pagos, ordenados cronológicamente, y cuándo y quién hizo el último cambio; un Empleado ve la lista y el saldo, pero no ese historial (D-061).

## HU-17 — Saber cuánto queda de cada cosa

**Como** Gerente o superior,
**quiero** ajustar la cantidad en stock de una variante indicando cuánto sumo o resto,
**para** reemplazar el cuaderno donde anoto entradas y salidas de mercadería.

### Criterios de aceptación

- Al ajustar, indico cuánto entró (5, +5) o salió (-3), no la cantidad final.
- Puedo marcar «Cambiar toda la cantidad» e indicar la cantidad final; la interfaz calcula la diferencia y la envía como cualquier otro ajuste.
- Antes de confirmar se ve el resultado (por ejemplo, Stock: 50 → 55); si quedaría negativo no se permite y se avisa cuánto hay.
- Si la unidad de venta de la variante admite decimales (por ejemplo metro o kilo), puedo escribir hasta 3 decimales (2,5; 0,750); si no los admite (por ejemplo unidad o rollo), solo puedo escribir un número entero y se me avisa si intento poner decimales.
- El sistema calcula y guarda la cantidad anterior y la resultante, junto con quién lo hizo y cuándo.
- Un Empleado puede ver el stock pero no ajustarlo.

## HU-18 — Ver qué se está por acabar

**Como** Usuario,
**quiero** ver de un vistazo qué variantes tienen poco o nada de stock,
**para** saber qué reponer antes de que falte.

### Criterios de aceptación

- Cada variante muestra su estado: Normal, Stock bajo o Sin stock, según su cantidad y su stock mínimo.
- Puedo definir un stock mínimo distinto para una variante puntual; si no lo hago, se usa un valor por defecto.
- Un contador visible en la navegación muestra cuántas variantes están en Stock bajo o Sin stock.
- Puedo ver el historial de movimientos de una variante: fecha, cantidad, antes y después, y quién lo hizo.

## HU-19 — Ajustar el tamaño de letra

**Como** Usuario,
**quiero** elegir el tamaño de letra de la aplicación,
**para** leerla cómoda según mi vista, en cualquier aparato.

### Criterios de aceptación

- La pantalla Configuración, disponible para todos los roles, muestra mi nombre, mi rol y el negocio activo.
- Puedo elegir entre cinco tamaños: Chica, Mediana, Grande, Muy grande y Enorme; el actual aparece marcado y veo una vista previa.
- Al elegir uno veo primero la vista previa; el cambio se aplica a toda la aplicación al tocar Guardar (abajo a la derecha), sin diálogo de confirmación.
- Si no se pudo guardar, vuelve al tamaño anterior y se me avisa.
- El tamaño queda guardado en mi cuenta: al entrar desde otro aparato veo el mismo.
- Las cuentas nuevas empiezan en Mediana; las que ya existían quedan en Grande.

## HU-20 — Cambiar mi nombre y mi contraseña

**Como** Usuario,
**quiero** cambiar mi propio nombre y mi propia contraseña,
**para** no depender de que un Administrador lo haga por mí ni de que me ponga una contraseña que no elegí.

### Criterios de aceptación

- En Configuración, sección Mi cuenta, junto a mi nombre hay un lápiz de editar que abre una ventana; ahí escribo el nombre nuevo y lo guardo o cancelo; antes de enviarlo se me pide confirmación, y el nombre nuevo se ve enseguida en el menú de la cuenta.
- Mi nombre de usuario (el de inicio de sesión) se muestra solo de lectura: lo cambia un Administrador.
- En Configuración hay una fila "Cambiar contraseña" que abre una ventana igual a la de restablecer contraseña de Cuentas, con un campo más para la contraseña actual; ahí escribo la nueva dos veces y puedo mostrar u ocultar lo que escribo.
- La nueva debe cumplir las reglas visibles (largo mínimo, mayúscula, minúscula y número) y ser distinta de la actual; si las dos nuevas no coinciden, no se envía nada.
- Si la contraseña actual no es correcta, se me avisa junto al formulario y no cambia nada.
- Antes de enviar el cambio se me pide confirmación ("¿Cambiar tu contraseña? Se van a cerrar las demás sesiones abiertas de tu cuenta."); si cancelo, no se envía nada. Al confirmar se me avisa que se cerraron las demás sesiones y sigo con la sesión actual.
- Si olvidé mi contraseña, un Administrador sigue pudiendo restablecerla.

## Orden sugerido del MVP

1. HU-03 — Consulta del precio vigente.
2. HU-01 — Búsqueda por texto y características.
3. HU-02 — Navegación por categorías.
4. HU-04 — Mantenimiento del catálogo.
5. HU-05 — Cambios e historial de precios.
6. HU-06 — Inicio de sesión y permisos.
7. HU-07 — Importación inicial.
8. HU-08 — Desactivación y reactivación.
9. HU-09 — Valores de atributos.
10. HU-10 — Presentaciones con precios distintos.

## Condiciones para considerar listo el MVP

- Todas las historias anteriores cumplen sus criterios de aceptación.
- Usuarios representativos prueban las tareas principales en navegadores móviles compatibles.
- Se valida una muestra representativa de cintas, telas y útiles.
- Se comprueba con un caso de prueba que un producto con variantes de distinto precio funciona de extremo a extremo, aunque el negocio real no lo necesite todavía.
- Se realiza una importación de ensayo y se comparan los resultados con las carpetas.
- Existe una copia de seguridad verificable y un procedimiento básico de restauración.
- No quedan errores críticos que puedan mostrar o conservar un precio incorrecto.
