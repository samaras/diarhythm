// electron.vite.config.ts
import { defineConfig as defineConfig2 } from "electron-vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
var __electron_vite_injected_dirname = "/home/samaras/projects/dev.to/diarhythm";
var vite_config_default = defineConfig({
  plugins: [react()],
  root: "src/renderer",
  base: "./",
  server: {
    host: true,
    allowedHosts: true,
    strictPort: false,
    port: 5173
  },
  build: {
    outDir: "../dist/electron/renderer",
    emptyOutDir: true
  },
  test: {
    environment: "node",
    include: [resolve(__electron_vite_injected_dirname, "tests/**/*.test.ts")]
  },
  resolve: {
    alias: {
      "@": resolve(__electron_vite_injected_dirname, "src/renderer")
    }
  }
});

// electron.vite.config.ts
var electron_vite_config_default = defineConfig2({
  main: {
    build: {
      outDir: "dist/electron/main",
      // better-sqlite3 is a native addon — keep it external so the bundle
      // requires it from node_modules at runtime instead of inlining a
      // stale path to its .node file.
      rollupOptions: {
        external: ["better-sqlite3", "@smartspectra/node-sdk", "koffi"]
      }
    }
  },
  preload: {
    build: {
      outDir: "dist/electron/preload"
    }
  },
  renderer: {
    ...vite_config_default,
    build: {
      ...vite_config_default.build,
      outDir: "dist/electron/renderer"
    }
  }
});
export {
  electron_vite_config_default as default
};
