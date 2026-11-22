import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  server: {
    host: true,
    allowedHosts: true,
    strictPort: false,
    port: 5173,
  },
  build: {
    outDir: '../dist/electron/renderer',
    emptyOutDir: true,
  },
  test: {
    environment: 'node',
    include: [resolve(__dirname, 'tests/**/*.test.ts')],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
})