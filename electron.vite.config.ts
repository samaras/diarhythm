import { defineConfig } from 'electron-vite'
import rendererConfig from './vite.config'

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/electron/main',
      // better-sqlite3 is a native addon — keep it external so the bundle
      // requires it from node_modules at runtime instead of inlining a
      // stale path to its .node file.
      rollupOptions: {
          external: ['better-sqlite3', '@smartspectra/node-sdk', 'koffi'],
      },
    },
  },
  preload: {
    build: {
      outDir: 'dist/electron/preload',
    },
  },
  renderer: {
    ...rendererConfig,
    build: {
      ...rendererConfig.build,
      outDir: 'dist/electron/renderer',
    },
  },
})