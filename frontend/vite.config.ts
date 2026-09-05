/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API_PROXY_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000'

const API_PATH_PREFIXES = [
  '/auth',
  '/accounts',
  '/search',
  '/categories',
  '/units',
  '/attributes',
  '/products',
  '/variants',
  '/imports',
  '/health',
]

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: Object.fromEntries(
      API_PATH_PREFIXES.map((prefix) => [prefix, { target: API_PROXY_TARGET, changeOrigin: true }]),
    ),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/testSetup.ts'],
  },
})
