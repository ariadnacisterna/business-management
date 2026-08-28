# Casos de uso

## CU-01 — Buscar y consultar un precio

**Actor principal:** Usuario  
**Objetivo:** Responder rápidamente cuánto cuesta un producto.  
**Disparador:** Un cliente pregunta el precio de un artículo.  
**Precondiciones:** El Usuario inició sesión y el catálogo se encuentra disponible.  
**Postcondición:** Se muestra el precio vigente sin modificar información.

### Flujo principal

1. El Usuario abre la aplicación con una sesión válida.
2. El sistema muestra el campo de búsqueda.
3. El Usuario escribe parte del nombre o características del producto.
4. El sistema busca coincidencias sin distinguir mayúsculas ni acentos y sin depender del orden de los términos.
5. El sistema presenta los productos coincidentes con información suficiente para distinguirlos.
6. El Usuario selecciona el producto, si fuera necesario.
7. El sistema muestra claramente el precio vigente.

### Flujos alternativos

- **A1 — Sin resultados:** el sistema informa que no encontró coincidencias y permite corregir o simplificar la búsqueda.
- **A2 — Varias coincidencias:** el sistema muestra una lista con características diferenciadoras.
- **A3 — Producto inactivo:** no aparece en la consulta normal.
- **A4 — Sesión vencida:** el sistema solicita al Usuario que vuelva a iniciar sesión antes de mostrar información.

## CU-02 — Consultar por categoría

**Actor principal:** Usuario  
**Objetivo:** Encontrar un producto cuando no se conoce su nombre exacto.

### Flujo principal

1. El Usuario abre el listado de categorías.
2. Selecciona una categoría, por ejemplo telas o útiles.
3. El sistema muestra sus productos activos.
4. El Usuario puede filtrar los resultados escribiendo términos adicionales.
5. Selecciona un producto y consulta su precio.

## CU-03 — Iniciar sesión

**Actor principal:** Usuario  
**Objetivo:** Acceder al catálogo y atribuir las operaciones a una persona autorizada.

### Flujo principal

1. El Usuario abre la aplicación.
2. El sistema solicita nombre de usuario y contraseña.
3. El Usuario ingresa sus credenciales.
4. El sistema valida la identidad y el estado de la cuenta.
5. El sistema inicia una sesión personal sujeta a la política de seguridad configurada.
6. El sistema habilita únicamente las funciones correspondientes al rol del Usuario.

### Flujos alternativos

- **A1 — Credencial incorrecta:** el sistema rechaza el acceso sin revelar si el nombre de usuario o la contraseña fue incorrecto.
- **A2 — Cuenta inactiva:** el sistema rechaza el acceso y no muestra el catálogo.
- **A3 — Sesión existente:** el sistema abre la búsqueda con la cuenta activa e identifica claramente qué Usuario está conectado.

## CU-04 — Crear un producto

**Actor principal:** Usuario  
**Precondición:** El Usuario inició sesión y posee permiso para administrar productos.

### Flujo principal

1. El Usuario elige crear un producto.
2. Ingresa nombre, categoría, unidad de venta, características aplicables y precio inicial.
3. Si el producto tiene versiones que se venden por separado, el Usuario las agrega indicando qué las distingue.
4. El sistema valida los datos y busca posibles duplicados.
5. El Usuario revisa y confirma.
6. El sistema crea el producto activo con sus variantes y registra el precio inicial de cada una junto con la responsable.

### Flujos alternativos

- **A1 — Datos incompletos o inválidos:** se indican los campos que deben corregirse.
- **A2 — Posible duplicado:** se muestra la variante existente para que el Usuario decida revisar o cancelar el alta.
- **A3 — Producto sin versiones diferenciadas:** el Usuario no agrega ninguna y el sistema crea una variante implícita que no se muestra en la interfaz. El producto se comporta como un artículo único con un solo precio.
- **A4 — Versiones con el mismo precio:** el Usuario ingresa un único importe y el sistema lo aplica a todas las variantes creadas.
- **A5 — Versiones con precios distintos:** el Usuario ingresa el importe de cada una.

## CU-05 — Modificar un producto

**Actor principal:** Usuario  
**Precondición:** El Usuario inició sesión, posee permiso para administrar productos y el producto existe.

### Flujo principal

1. El Usuario localiza el producto.
2. Abre su edición.
3. Modifica nombre, categoría, unidad o características.
4. Si corresponde, agrega, modifica, desactiva o reactiva variantes del producto.
5. El sistema valida posibles duplicados.
6. El Usuario confirma y el sistema guarda el cambio con su fecha y responsable.

El cambio de precio se realiza mediante CU-06 para proteger su historial.

### Flujos alternativos

- **A1 — Variante nueva sin precio:** el sistema la crea pero no la publica en las consultas hasta que reciba un precio vigente en el negocio activo.
- **A2 — Variante desactivada:** deja de aparecer en las consultas y conserva su historial de precios.

## CU-06 — Actualizar un precio

**Actor principal:** Usuario  
**Precondición:** El Usuario inició sesión, posee permiso para administrar precios y el producto está activo.

### Flujo principal

1. El Usuario localiza el producto.
2. Selecciona cambiar precio.
3. El sistema muestra el precio vigente en el negocio activo. Si el producto tiene varias variantes, muestra el precio de cada una e indica si coinciden.
4. El Usuario ingresa el nuevo precio.
5. El sistema solicita confirmación mostrando el valor anterior y el nuevo.
6. El Usuario confirma.
7. El sistema registra el nuevo precio, finaliza la vigencia del anterior y guarda fecha, hora y responsable.

### Flujos alternativos

- **A1 — Valor inválido:** si el valor es menor o igual que cero, el sistema explica el error y no modifica el precio.
- **A2 — Precio modificado por otra persona:** el sistema advierte que el dato cambió y muestra el valor vigente antes de permitir una nueva confirmación.
- **A3 — Un precio para todas las variantes:** el Usuario elige aplicar el importe a todo el producto. El sistema cierra la vigencia anterior y registra el nuevo precio de cada variante dentro de una única operación, de modo que ninguna quede con el valor viejo.
- **A4 — Precio de una sola variante:** el Usuario elige la variante y cambia únicamente su precio. Las demás conservan el suyo.

## CU-07 — Consultar historial de precios

**Actor principal:** Usuario  
**Precondición:** El Usuario inició sesión y posee permiso para consultar el historial.

### Flujo principal

1. El Usuario localiza un producto.
2. Abre su historial.
3. El sistema muestra los precios ordenados cronológicamente, con sus períodos y responsables.
4. Cuando el producto tiene varias variantes, el historial se presenta por variante y el Usuario puede elegir cuál consultar.

## CU-08 — Administrar categorías, unidades y atributos

**Actor principal:** Usuario

El Usuario puede crear o modificar categorías, unidades y los valores de los atributos normalizados. En el MVP el único atributo es el color, que llega con un catálogo inicial de valores precargados y permite agregar los que falten.

El sistema impide duplicar valores equivalentes que solo difieran por mayúsculas, minúsculas o acentos, y no permite eliminar una opción utilizada; podrá desactivarla si no debe emplearse en variantes nuevas.

La definición de atributos adicionales, como marca o presentación para otros rubros, se incorporará en una etapa posterior sobre este mismo mecanismo.

## CU-09 — Importar el catálogo inicial

**Actor principal:** Administradora  
**Precondición:** La Administradora inició sesión y dispone de un archivo con la plantilla admitida.

### Flujo principal

1. La Administradora selecciona el archivo CSV o Excel.
2. El sistema analiza sus filas sin modificar el catálogo.
3. El sistema informa altas, actualizaciones, duplicados, advertencias y errores.
4. La Administradora revisa el resumen.
5. La Administradora confirma la importación.
6. El sistema aplica los datos válidos según la política definida y registra la operación.
7. El sistema muestra el resultado final.

### Flujos alternativos

- **A1 — Estructura no admitida:** se indican las columnas faltantes o inválidas.
- **A2 — Errores de datos:** se identifican las filas y motivos para corregir el archivo.
- **A3 — Cancelación:** no se modifica el catálogo.

Cada fila de la planilla representará una variante con su precio. Las filas de un mismo producto se agruparán por su nombre y categoría. Los productos sin versiones diferenciadas ocuparán una sola fila y recibirán una variante implícita.

Antes del desarrollo se decidirá si una importación con errores aplica únicamente filas válidas o exige corregir todo el archivo.

## CU-10 — Desactivar o reactivar un producto o una variante

**Actor principal:** Usuario

1. El Usuario localiza el producto en administración.
2. Solicita cambiar el estado del producto completo o el de una de sus variantes.
3. El sistema explica el efecto y solicita confirmación.
4. El Usuario confirma.
5. El sistema cambia el estado, conserva el historial y registra la responsable.

Desactivar un producto retira también sus variantes de las consultas. Desactivar una variante no afecta a las demás.
