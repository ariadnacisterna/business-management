# Identidad visual y componentes de la SPA

Este documento define la identidad de marca del negocio piloto y las
convenciones visuales que toda pantalla de la aplicación cliente (SPA)
debe seguir, para que las distintas conversaciones de tarea (T-010 en
adelante) produzcan una interfaz consistente sin tener que redefinir estos
criterios en cada prompt. Es al front lo que
[12-estandares-de-codigo.md](12-estandares-de-codigo.md) es al código.

No es una libertad creativa por pantalla: cualquier color, tipografía o
medida fuera de lo que este documento define debe justificarse o
consultarse, igual que un valor hardcodeado fuera de una constante
(D-031).

## Alcance de este documento

Cubre la identidad y los componentes de uso general (botones, tarjetas,
tablas, formularios, modales). No describe pantallas de fases futuras
(dashboard con KPIs, inventario, ventas, panel financiero — D-009 las deja
fuera del MVP): esas se documentarán recién cuando su tarea correspondiente
se planifique, para no diseñar sobre funcionalidad que todavía no existe.

## Identidad de marca

El negocio piloto es **Casa Diaco**, una despensa familiar con 42 años de
trayectoria (D-038). A diferencia del resto del código y la documentación
—que evitan supuestos específicos de un rubro para mantener el sistema
adaptable (D-023)— la identidad visual sí es propia de este negocio: cada
negocio que use el sistema tendría la suya en su propio despliegue
(coherente con la idea de "links distintos por negocio").

- **Nombre:** Casa Diaco
- **Bajada, solo en la pantalla de inicio de sesión:** "Desde 1982"
- **Isotipo:** iniciales "CD" en un círculo rojo (mientras no exista un
  archivo de logo definitivo, un círculo con las iniciales alcanza)

## Paleta de colores

Variables CSS en `frontend/src/index.css`, sobre lo que ya definió T-010
(`--text`, `--bg`, `--border`, `--accent`). Mantener `--accent` como el
nombre de la variable del color de marca (evita un renombre sin necesidad
real); actualizar su valor y sumar las que falten:

| Variable | Claro | Oscuro | Uso |
|---|---|---|---|
| `--accent` | `#af1405` | `#e8503c` (más claro, contraste sobre fondo oscuro) | Color primario: botones de acción principal, enlaces, foco de inputs |
| `--accent-contrast` | `#fff` | `#fff` | Texto sobre `--accent` |
| `--surface-brand` | `#fffae8` | `#242017` (versión oscura del crema) | Fondos secundarios, tarjetas destacadas — uso puntual, no como fondo general |
| `--success` | `#2e7d32` | `#66bb6a` | Confirmaciones, estados "activo" |
| `--danger` | `#c62828` | `#ef5350` | Errores, acciones destructivas |
| `--warning` | `#e65100` | `#ffa726` | Advertencias (ej. stock bajo, cuando exista) |
| `--info` | `#1565c0` | `#42a5f5` | Mensajes informativos |

Los colores "claro" y "oscuro" siguen el mismo mecanismo que ya usa
`index.css` (`@media (prefers-color-scheme: dark)`): no se elige un modo,
se respeta el del sistema operativo de quien usa la aplicación.

No hardcodear estos valores hexadecimales fuera de `index.css`: todo
componente los consume vía `var(--accent)`, etc. (mismo criterio que D-031
aplicado a CSS).

## Tipografía

- **Interfaz (todo el contenido):** la fuente de sistema que ya configuró
  T-010 (`system-ui, 'Segoe UI', Roboto, sans-serif`). No se introduce una
  tipografía nueva para esto: carga más rápido, no depende de un archivo de
  fuente, y es igual de legible.
- **Marca ("Casa Diaco" en el encabezado y en el login):** tipografía
  "Jazz" si el Responsable del proyecto provee el archivo de la fuente
  (con su licencia); mientras no exista ese archivo, usar la fuente de
  interfaz en negrita (`font-weight: 700`) para el nombre de marca, para no
  bloquear una tarea por un archivo que todavía no está disponible.
- **Tamaños:** los que ya usa T-010 como base (16px cuerpo). Un precio
  destacado (pantalla de búsqueda, detalle de producto) usa un tamaño mayor
  y peso semibold como mínimo (`font-size: 20px; font-weight: 600`), para
  que sea legible de un vistazo (HU-03).

## Componentes

Reutilizar lo que ya existe en `frontend/src/` antes de crear un componente
nuevo (mismo criterio que D-031 para el backend): `AppLayout`, los
`.module.css` de T-010, y los patrones de abajo.

### Botones

- **Primario:** fondo `var(--accent)`, texto `var(--accent-contrast)`, sin
  borde, `border-radius: 6px` (ya usado en T-010).
- **Secundario:** fondo transparente, borde `var(--border)` (patrón ya
  usado en el botón "Cerrar sesión" de `AppLayout`).
- **Peligro** (ej. desactivar): fondo `var(--danger)`, texto blanco.
- Alto mínimo 44px para que sea cómodo también en pantallas táctiles.

### Tarjetas

`border-radius: 8px`, `border: 1px solid var(--border)` (preferir un borde
sutil a una sombra: es más liviano y funciona igual en modo oscuro),
`padding: 16px`.

### Tablas

Encabezado con `font-weight: 600`, filas con `border-bottom: 1px solid
var(--border)`, `padding: 8px 12px` por celda. En pantallas angostas
(menos de 640px), preferir una lista de tarjetas en vez de una tabla con
scroll horizontal forzado — es más legible en un teléfono.

### Formularios e inputs

`border: 1px solid var(--border)`, `border-radius: 6px`, `padding: 10px
12px`, `font-size: 16px` (evita el zoom automático de iOS en un input
enfocado). Foco: `border-color: var(--accent)`.

### Modales

Fondo superpuesto semitransparente, tarjeta centrada con `border-radius:
8px` y `padding: 24px`, botón de cierre visible, acción primaria +
cancelar. Usar un modal para una confirmación puntual (ej. cambiar un
precio); una pantalla completa para un flujo con varios pasos (ej.
importación).

## Responsividad

Los mismos puntos de corte para todas las pantallas:

| Punto de corte | Ancho | Criterio |
|---|---|---|
| Teléfono | hasta 767px | una columna, navegación no permanente |
| Tablet | 768px a 1023px | igual que escritorio si entra sin apretujarse; si no, como teléfono |
| Escritorio | 1024px en adelante | el layout de referencia |

No diseñar para un ancho de escritorio "ideal" (1920px) como caso
principal: la mayoría de las consultas rápidas (HU-01, HU-03) van a
ocurrir desde un teléfono, según [01-vision-y-alcance.md](01-vision-y-alcance.md).
