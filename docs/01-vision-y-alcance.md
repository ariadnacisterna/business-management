# Visión y alcance

## Contexto

El negocio es una mercería y librería atendida por personas con roles de Administradora y Empleada. Los precios se conservan en carpetas impresas, separadas por rubros como telas, útiles y otros productos. Para responder una consulta se localiza la carpeta correspondiente y se lee la plantilla hasta encontrar el artículo.

Los faltantes se registran inicialmente en hojas sueltas y luego se transcriben a cuadernos, posiblemente separados por proveedor. Las compras son periódicas; un olvido puede postergar la reposición hasta el mes siguiente.

## Problema

La información está organizada, pero depende de soportes físicos y de sucesivas transcripciones manuales. Esto produce:

- demoras al consultar precios;
- riesgo de utilizar un precio desactualizado;
- información distribuida entre carpetas, hojas y cuadernos;
- riesgo de omitir faltantes o compras;
- dificultad para construir en el futuro un historial analizable.

## Visión del producto

Ofrecer una fuente digital única, simple y confiable para consultar y mantener la información comercial del negocio desde una tablet o un celular. La primera versión se concentrará en precios; las siguientes incorporarán proveedores, reposición, inventario, ventas, compras y análisis.

El producto completo se concibe como una aplicación web adaptable a dispositivos móviles respaldada por una API. La API por sí sola no constituye una solución utilizable por las usuarias.

### Alcance a largo plazo

El primer destinatario es una mercería y librería concreta, pero el sistema se concibe además como una herramienta reutilizable en otros rubros minoristas, como una despensa, y en organizaciones que tengan más de un negocio y quieran ver su información en conjunto.

Esa ambición no adelanta funcionalidad: el MVP sigue siendo la consulta de precios de un solo negocio. Lo que sí determina es un conjunto acotado de decisiones estructurales que son baratas hoy y costosas después, porque afectan a información que el sistema conserva de forma inmutable:

- el precio, el código de identificación futuro y la existencia futura pertenecen a la **variante**, es decir a la unidad que efectivamente se vende, y no al producto que la agrupa;
- toda información dependiente del comercio queda atribuida a un **negocio** desde su creación, aunque exista uno solo;
- las características propias de cada rubro se resuelven con **atributos normalizados cargados como datos**, no con campos fijos del sistema.

El resto de la adaptación —vocabulario, categorías, unidades, atributos y datos iniciales— se resolverá cuando exista un segundo rubro real y no se anticipa aquí.

## Objetivos del MVP

1. Encontrar el precio vigente de un producto sin recurrir a carpetas físicas.
2. Permitir búsquedas por texto y navegación por categoría.
3. Mantener productos y precios desde distintos dispositivos.
4. Conservar un historial confiable de los cambios de precio.
5. Cargar el catálogo inicial mediante una planilla obtenida a partir de las carpetas existentes.
6. Preparar el modelo conceptual para ampliar el sistema sin implementar todavía inventario ni operaciones financieras.
7. Dejar resueltas las decisiones estructurales que permitirán, más adelante, escanear productos, controlar existencias y atender otro rubro u otro negocio sin migrar el historial ya cargado.

## Alcance incluido

- Aplicación web adaptable a tablet y celulares.
- Catálogo de productos, variantes, categorías y unidades de venta.
- Operación sobre un único negocio, creado durante la instalación.
- Acceso mediante una cuenta personal antes de consultar o administrar información.
- Búsqueda por nombre y características, sin depender del orden de las palabras.
- Navegación por categorías.
- Catálogo inicial de colores precargados, ampliable por las usuarias autorizadas.
- Alta, modificación, desactivación y reactivación de productos y variantes.
- Actualización de precios con historial de cambios, incluida la posibilidad de fijar un mismo precio para todas las variantes de un producto en una sola operación.
- Identificación de la persona que realiza una edición.
- Importación inicial mediante CSV o Excel.
- Información centralizada y visible desde varios dispositivos.
- Resolución simple de conflictos: prevalece la modificación más reciente.

## Fuera del MVP

- Proveedores y listas de compra.
- Registro de faltantes.
- Estados de reposición (`faltante`, `comprado`, `ingresado`).
- Cantidades exactas de inventario.
- Registro de ventas y compras.
- Ingresos, egresos, márgenes y reportes financieros.
- Códigos de barras y lectura mediante escáner o cámara.
- Administración de más de un negocio y vista consolidada entre negocios.
- Atributos normalizados distintos del color y datos iniciales de otros rubros.
- Alertas y recordatorios de reposición.
- Pronósticos, optimización o programación lineal.
- Extracción automática desde fotografías dentro del sistema.

La preparación externa de una planilla mediante fotografías o inteligencia artificial sí es compatible con el proceso de carga inicial.

## Supuestos iniciales

- Se manejarán inicialmente cientos de productos.
- El MVP funcionará con una única organización y un único negocio, creados durante la instalación.
- Todos los importes se expresarán exclusivamente en pesos argentinos (ARS).
- El precio será siempre el precio final al público.
- Todo precio deberá ser estrictamente mayor que cero.
- Cada variante tendrá un solo precio de venta vigente por negocio.
- En la mayoría de los productos de este negocio, todas las variantes compartirán el mismo precio.
- Solo las cuentas autorizadas podrán consultar los precios.
- Cada cuenta personal tendrá el rol de Administradora o Empleada.
- La interfaz estará diseñada para personas sin conocimientos técnicos y para uso táctil.

## Indicadores de éxito propuestos

- Al menos 90 % de las consultas habituales se resuelven mediante el sistema durante el primer mes de uso.
- Una usuaria encuentra un producto conocido en menos de 15 segundos.
- Todos los cambios de precio posteriores a la puesta en marcha quedan registrados en el historial.
- El catálogo inicial puede validarse antes de ser incorporado definitivamente.

Estos valores son objetivos iniciales y deberán validarse mediante una prueba real en el negocio.

## Evolución prevista

### Etapa 2: reposición

Proveedores, faltantes, cantidades solicitadas, listas agrupadas por proveedor o categoría, estados de compra y recordatorios.

### Etapa 3: operación e inventario

Stock exacto por variante y negocio, movimientos, ventas cargadas manualmente, compras, ajustes y permisos para información financiera.

Estas dos capacidades se agrupan deliberadamente: un stock exacto solo se mantiene confiable si las ventas lo descuentan. Incorporar existencias sin registrar ventas produciría un dato que se desincroniza en pocas semanas y que las usuarias dejarían de creer.

### Etapa 4: identificación por código

Códigos de barras asociados a la variante, lectura mediante escáner o cámara del dispositivo, y alta o consulta de un producto a partir de su código.

Esta etapa es la que vuelve práctico el uso en rubros con productos etiquetados de fábrica, como una despensa. Aparece después del inventario porque su beneficio principal es acelerar la carga de ventas y el recuento de existencias, no la consulta de precios.

### Etapa 5: varios negocios

Administración de más de un negocio dentro de una organización, permisos por negocio y vista consolidada para quien acceda a más de uno.

### Etapa 6: análisis

Pronóstico de demanda, sugerencias de reposición, costos, márgenes y optimización de compras. Su viabilidad dependerá de contar con datos históricos suficientes y confiables.

## Orden de las etapas

La reposición precede al inventario por dos motivos: resuelve un problema que hoy existe y produce pérdidas —los faltantes anotados en hojas sueltas que se transcriben a cuadernos y a veces se olvidan hasta la compra siguiente— y no exige que se registre toda la operación diaria para seguir siendo útil. El inventario exacto, en cambio, solo se sostiene si el registro es completo.

Las etapas 4 y 5 no dependen entre sí y su orden podrá invertirse según lo que el negocio necesite primero.

