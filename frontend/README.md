# Frontend

Aplicación cliente (SPA) en React + Vite + TypeScript. Ver
`docs/09-propuesta-arquitectura-tecnica.md` (sección "Interfaz: aplicación
cliente separada frente a renderizado en el servidor") y
`docs/12-estandares-de-codigo.md` en la raíz del repositorio para las
decisiones que sustentan esta estructura.

## Instalación

```
npm install
```

## Desarrollo

```
npm run dev
```

El servidor de Vite proxya las rutas de la API (`/auth`, `/accounts`,
`/search`, `/categories`, `/units`, `/attributes`, `/products`, `/variants`,
`/imports`, `/health`) hacia el backend, para que el navegador vea todo bajo
el mismo origen (ver `vite.config.ts`). Por defecto apunta a
`http://localhost:8000`; para usar otro puerto, definir la variable de
entorno `VITE_API_PROXY_TARGET` antes de levantar el servidor.

## Pruebas

```
npm run test
```

## Otros comandos

```
npm run typecheck   # TypeScript sin emitir archivos
npm run lint         # Oxlint
npm run build        # build de producción
```
