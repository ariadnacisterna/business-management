# Requisitos

## Requisitos funcionales

### Consulta

| ID | Requisito | Prioridad |
|---|---|---:|
| RF-001 | El sistema permitirá consultar precios únicamente después de iniciar sesión con una cuenta autorizada. | Alta |
| RF-002 | El sistema permitirá buscar productos mediante una o más palabras. | Alta |
| RF-003 | La búsqueda considerará nombre, categoría y características como tipo, número y color. | Alta |
| RF-004 | La búsqueda ignorará diferencias de mayúsculas, minúsculas y acentos. | Alta |
| RF-005 | La búsqueda no dependerá del orden de los términos ingresados. | Alta |
| RF-006 | El sistema permitirá navegar y filtrar por categoría. | Alta |
| RF-007 | Los resultados mostrarán la identificación mínima necesaria para distinguir productos y variantes similares, junto con su precio vigente. | Alta |
| RF-008 | El sistema informará claramente cuando no encuentre coincidencias. | Alta |
| RF-009 | Los productos y las variantes inactivas no aparecerán en las consultas normales. | Media |
| RF-035 | Las consultas mostrarán únicamente las variantes con precio vigente en el negocio activo. | Alta |

Ejemplo esperado para RF-002 a RF-005: la consulta `cinta bebe 2 roja` debe poder encontrar la combinación correspondiente aunque los datos se hayan registrado con acentos, mayúsculas o en otro orden.

### Administración del catálogo

| ID | Requisito | Prioridad |
|---|---|---:|
| RF-010 | Una usuaria autorizada podrá crear productos. | Alta |
| RF-011 | Una usuaria autorizada podrá modificar la información de un producto. | Alta |
| RF-012 | Un producto podrá tener características variables según su clase, sin exigir los mismos campos a todos los rubros. | Alta |
| RF-013 | El sistema permitirá asignar una categoría a cada producto. | Alta |
| RF-014 | El sistema permitirá asignar una unidad de venta, como unidad, metro, kilo, paquete o rollo, e indicar si admite cantidades fraccionarias. | Alta |
| RF-015 | Una usuaria autorizada podrá crear y modificar categorías y unidades. | Media |
| RF-016 | Una usuaria autorizada podrá desactivar y reactivar un producto o una variante sin borrar su historial. | Media |
| RF-017 | El sistema evitará, o advertirá sobre, variantes duplicadas durante el alta y la importación. | Alta |
| RF-036 | Todo producto tendrá al menos una variante. Cuando el producto no presente diferencias reales, el sistema creará una variante implícita sin exponerla en la interfaz. | Alta |
| RF-037 | Una usuaria autorizada podrá agregar, modificar, desactivar y reactivar las variantes de un producto. | Alta |

### Precios e historial

| ID | Requisito | Prioridad |
|---|---|---:|
| RF-018 | Una usuaria autorizada podrá establecer y actualizar el precio de una variante en el negocio activo. | Alta |
| RF-019 | Cada variante tendrá un único precio de venta vigente por negocio. | Alta |
| RF-020 | Al modificar un precio, el sistema conservará el valor anterior y el nuevo. | Alta |
| RF-021 | Cada cambio de precio registrará fecha, hora y usuaria responsable. | Alta |
| RF-022 | Una usuaria autorizada podrá consultar el historial cronológico de precios de una variante. | Media |
| RF-023 | El historial de precios no podrá modificarse desde las funciones normales de administración. | Alta |
| RF-038 | El sistema permitirá aplicar un mismo precio a todas las variantes de un producto en una sola operación, registrando el cambio individualmente en cada una. | Alta |

### Acceso, dispositivos e importación

| ID | Requisito | Prioridad |
|---|---|---:|
| RF-024 | El sistema exigirá autenticación antes de permitir cualquier consulta o función administrativa. | Alta |
| RF-025 | El sistema aplicará los permisos definidos para los roles Empleado, Gerente y Administrador. | Alta |
| RF-026 | El sistema mantendrá la información centralizada y disponible desde distintos dispositivos compatibles. | Alta |
| RF-027 | Ante ediciones concurrentes del mismo dato, prevalecerá la modificación aceptada más recientemente por el sistema. | Media |
| RF-028 | Un Administrador podrá importar productos, variantes y precios desde un archivo CSV o Excel. | Alta |
| RF-029 | Antes de confirmar una importación, el sistema mostrará errores, duplicados y un resumen de los cambios. | Alta |
| RF-030 | Una importación confirmada registrará su fecha y la usuaria responsable. | Media |
| RF-031 | Un Administrador podrá crear, desactivar y modificar las cuentas y roles de los usuarios. | Alta |
| RF-039 | Toda consulta y toda modificación de precios se realizarán en el contexto de un negocio al que la cuenta tenga acceso. | Alta |

### Atributos normalizados

| ID | Requisito | Prioridad |
|---|---|---:|
| RF-032 | El sistema incluirá el atributo `color` con un catálogo inicial de valores precargados. | Alta |
| RF-033 | Un Usuario autorizado podrá agregar, modificar y desactivar los valores de un atributo. | Alta |
| RF-034 | Cuando una variante utilice un atributo normalizado, su valor deberá seleccionarse de la lista activa de ese atributo. | Alta |
| RF-040 | El sistema permitirá definir atributos normalizados adicionales, como marca o presentación, sin modificar el código de la aplicación. | Media |

### Reposición (Etapa 2)

| ID | Requisito | Prioridad |
|---|---|---:|
| RF-041 | Un Usuario autorizado podrá crear, modificar y desactivar proveedores de un negocio, con razón social, contacto, email, teléfono y las categorías que provee. | Alta |
| RF-042 | Una usuaria autorizada podrá asignar un proveedor habitual a un producto. | Media |
| RF-043 | Cualquier Usuario con sesión activa podrá marcar una variante como faltante, sin necesitar un permiso especial. | Alta |
| RF-044 | El sistema mostrará una lista de faltantes pendientes (en estado Faltante o Pedido), agrupable por proveedor o por categoría. | Alta |
| RF-045 | Un Usuario autorizado podrá avanzar un faltante de Faltante a Pedido y de Pedido a Recibido, o cancelarlo (volver a Faltante) mientras no esté Recibido. | Alta |
| RF-046 | El sistema mostrará, en algún lugar visible de la navegación, un contador de faltantes pendientes. | Media |
| RF-047 | El sistema registrará la fecha de la última compra de un proveedor. | Baja |
| RF-048 | Un Usuario autorizado podrá crear y modificar clientes, con nombre y teléfono opcional. | Alta |
| RF-049 | Un Usuario autorizado podrá registrar un cargo o un pago en la cuenta corriente de un cliente. | Alta |
| RF-050 | El sistema mostrará el saldo actual de cada cliente, calculado a partir de sus cargos y pagos. | Alta |
| RF-051 | El sistema mostrará una lista de clientes con saldo pendiente. | Media |
| RF-052 | Un Usuario autorizado podrá ajustar la cantidad en stock de una variante, indicando la cantidad nueva y un motivo. | Alta |
| RF-053 | El sistema calculará y mostrará el estado de stock de cada variante (Normal, Stock bajo o Sin stock) según su cantidad actual y su stock mínimo. | Alta |
| RF-054 | El sistema registrará un historial de movimientos de stock por variante: fecha, motivo, cantidad, valores antes y después, cuenta que lo hizo, y una observación opcional. | Alta |
| RF-055 | Un Usuario autorizado podrá crear, editar y desactivar motivos de movimiento de stock, igual que categorías o unidades. | Media |
| RF-056 | Un Usuario autorizado podrá definir el stock mínimo de cada variante; el sistema aplicará un valor por defecto si no se define uno. | Media |
| RF-057 | El sistema mostrará, en algún lugar visible de la navegación, un contador de variantes con stock bajo o sin stock. | Media |

## Requisitos no funcionales

| ID | Dimensión | Requisito |
|---|---|---|
| RNF-001 | Usabilidad | La consulta principal deberá ser comprensible sin capacitación técnica y requerir la menor cantidad razonable de pasos. |
| RNF-002 | Interfaz | La aplicación deberá adaptarse a distintos tamaños de pantalla y ofrecer controles adecuados para uso táctil. |
| RNF-003 | Legibilidad | Los precios y resultados deberán utilizar tipografía y contraste claramente legibles. |
| RNF-004 | Rendimiento | El 95 % de las búsquedas sobre el catálogo inicial debería responder en menos de dos segundos. |
| RNF-005 | Capacidad | El diseño deberá admitir al menos varios miles de variantes sin rediseñar el dominio. |
| RNF-006 | Integridad | Las actualizaciones de precio y sus registros históricos deberán guardarse de forma indivisible. |
| RNF-007 | Seguridad | El catálogo, los precios y las funciones administrativas solo serán accesibles para usuarios autenticados y autorizados. |
| RNF-008 | Trazabilidad | Las operaciones relevantes deberán registrar fecha, hora y actor. |
| RNF-009 | Recuperación | Se deberá definir una estrategia de copias de seguridad y restauración antes de utilizar datos reales. |
| RNF-010 | Compatibilidad | La aplicación deberá funcionar en navegadores móviles modernos. |
| RNF-011 | Evolución | El modelo deberá permitir agregar proveedores, movimientos, stock por variante, compras y ventas. |
| RNF-012 | Protección de acceso | Ningún endpoint de catálogo o precios será accesible sin una sesión válida; solo las funciones necesarias para iniciar o recuperar el acceso podrán ser públicas. |
| RNF-013 | Credenciales | Las contraseñas no se almacenarán en texto legible y deberán tratarse mediante mecanismos de seguridad reconocidos. |
| RNF-014 | Privacidad | El acceso normal no requerirá registrar ni asociar dispositivos concretos a una cuenta. |
| RNF-015 | Sesión | Las sesiones vencerán según una política de seguridad configurable y requerirán una nueva autenticación. Su duración exacta no se publicará en la documentación funcional. |
| RNF-016 | Adaptabilidad de rubro | Incorporar un rubro distinto, como despensa, deberá resolverse mediante categorías, unidades y atributos cargados como datos, sin modificar el esquema ni el código. |
| RNF-017 | Alcance por negocio | Toda información dependiente del negocio deberá quedar atribuida a un negocio desde su creación, aun cuando el MVP opere con uno solo. |
| RNF-018 | Aislamiento | Ninguna consulta deberá exponer información de un negocio al que la cuenta activa no tenga acceso. |

## Requisitos de datos

- Todo producto debe tener nombre, categoría, unidad de venta, estado y al menos una variante.
- Toda variante debe tener un precio vigente en un negocio para poder publicarse en las consultas de ese negocio.
- Todos los importes se expresarán exclusivamente en pesos argentinos (ARS).
- Todo precio será final al público y deberá ser estrictamente mayor que cero.
- Las características aplicables dependerán del rubro. Una cinta puede utilizar tipo, número y color; una tela o un útil puede identificarse únicamente por nombre o por otras características; una despensa necesitará marca y presentación.
- Los valores de un atributo normalizado se seleccionarán de una lista común, que podrá ampliarse sin modificar el sistema.
- El sistema evitará valores duplicados de un mismo atributo que solo difieran por mayúsculas, minúsculas o acentos.
- Los nombres y características conservarán su escritura original, aunque se normalizarán para buscar.
- Los datos históricos deberán conservarse cuando un producto o una variante se desactive.
- El catálogo pertenecerá a la organización; el precio pertenecerá al par formado por la variante y el negocio.
