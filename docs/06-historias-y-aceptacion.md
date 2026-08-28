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

- Antes de confirmar se muestran el precio anterior y el nuevo.
- Al confirmar, el nuevo precio pasa a ser el único vigente.
- El valor anterior continúa disponible en el historial.
- El registro incluye fecha, hora y responsable.
- Una consulta posterior muestra inmediatamente el nuevo precio.
- Dado un producto con varias variantes del mismo precio, cuando se elige aplicarlo a todas, entonces ninguna queda con el valor anterior y cada una registra su propio cambio.
- Si la actualización conjunta falla a mitad de camino, no se aplica ningún cambio.

## HU-06 — Proteger el acceso al catálogo

**Como** Administradora,  
**quiero** que solo las personas con una cuenta autorizada puedan ingresar,  
**para** impedir accesos no autorizados al catálogo y a sus funciones.

### Criterios de aceptación

- Al abrir la aplicación sin una sesión válida se muestra el inicio de sesión y no el catálogo.
- Una credencial inválida no permite consultar precios ni habilita la edición.
- Cada persona utiliza una cuenta individual con el rol Empleada o Administradora.
- La aplicación identifica claramente qué cuenta está activa.
- Cada cambio queda asociado a un perfil activo.
- La sesión vence según la política de seguridad configurada y luego exige una nueva autenticación.
- El Usuario puede cerrar sesión antes de su vencimiento.

## HU-07 — Cargar el catálogo mediante una planilla

**Como** Administradora,  
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
