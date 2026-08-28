# Sistema de consulta y gestión para mercería/librería

Este repositorio comienza por la definición funcional del producto. El MVP busca reemplazar la consulta manual de precios en carpetas por una consulta rápida desde tablet y celulares.

El primer destinatario es una mercería y librería concreta. El sistema se
concibe además como una herramienta reutilizable en otros rubros minoristas y en
organizaciones con más de un negocio, pero esa ambición no adelanta
funcionalidad: solo determina un conjunto acotado de decisiones estructurales
que serían costosas de corregir una vez cargado el historial de precios.

Se eligieron FastAPI para la API, PostgreSQL para la persistencia y una
aplicación cliente separada (SPA) con TypeScript para la interfaz. La
propuesta de arquitectura técnica fue aprobada el 27 de agosto de 2026 y
autoriza el inicio de la programación del MVP.

## Documentación

- [Índice y estado](docs/README.md)
- [Visión y alcance](docs/01-vision-y-alcance.md)
- [Actores y permisos](docs/02-actores-y-permisos.md)
- [Requisitos](docs/03-requisitos.md)
- [Reglas de negocio](docs/04-reglas-de-negocio.md)
- [Casos de uso](docs/05-casos-de-uso.md)
- [Historias de usuario y criterios de aceptación](docs/06-historias-y-aceptacion.md)
- [Modelo conceptual](docs/07-modelo-conceptual.md)
- [Trazabilidad y decisiones pendientes](docs/08-trazabilidad-y-decisiones.md)
- [Propuesta de arquitectura técnica](docs/09-propuesta-arquitectura-tecnica.md)
- [Flujo de trabajo entre conversaciones](docs/10-flujo-de-trabajo.md)
- [Seguridad y privacidad](docs/11-seguridad-y-privacidad.md)
- [Estándares de código](docs/12-estandares-de-codigo.md)
