/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage } from 'node:http'
import { defineConfig } from 'vite'

const API_PROXY_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000'

const API_PATH_PREFIXES = [
  '/auth',
  '/accounts',
  '/search',
  '/variants',
  '/imports',
  '/health',
  '/stock',
  '/movement-reasons',
]

const SPA_ROUTE_PREFIXES = ['/products', '/categories', '/units', '/attributes']

function bypassDocumentNavigations(req: IncomingMessage) {
  if (req.headers.accept?.includes('text/html')) return '/index.html'
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      ...Object.fromEntries(
        API_PATH_PREFIXES.map((prefix) => [prefix, { target: API_PROXY_TARGET, changeOrigin: true }]),
      ),
      ...Object.fromEntries(
        SPA_ROUTE_PREFIXES.map((prefix) => [
          prefix,
          { target: API_PROXY_TARGET, changeOrigin: true, bypass: bypassDocumentNavigations },
        ]),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/testSetup.ts'],
  },
})
