import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Mount-agnostic bundle (founder-locked architecture):
//
// The compiled web assets ride embedded in a SIGNED, content-addressed wasm
// component, so the artifact must be BYTE-IDENTICAL wherever it runs — its
// digest + cosign signature are preserved. The deployment mount is applied at
// SERVE time by the Yeti web server (the router injects `<base href="{mount}/">`
// + `window.__YETI_BASE_PATH` into the served index.html), never baked at build
// time.
//
//   - `base: './'` emits RELATIVE asset URLs and makes Vite's lazy chunks
//     self-resolve against their own URL at any mount/depth.
//   - `__STATIC_ROOT__` (the routing/API base, no trailing slash) is mapped to a
//     RUNTIME global the served index.html sets from `window.__YETI_BASE_PATH`
//     (fallback `/`). With no injector (`npm run dev`) the global is undefined →
//     `/`, so assets resolve at the dev root and HMR is intact.

// esbuild `define` only accepts a literal or a dotted entity name, so the base
// is read through a runtime global the index.html computes in <head> before any
// module evaluates.
const RUNTIME_STATIC_ROOT = 'window.__YETI_STATIC_ROOT__'
const RESOURCES_ROOT = 'api'

const __dir = dirname(fileURLToPath(import.meta.url))
const yetiYaml = readFileSync(resolve(__dir, '../../../yeti-config.yaml'), 'utf-8')
const YETI_PORT = parseInt(yetiYaml.match(/^port:\s*(\d+)/m)?.[1] ?? '9996', 10)

export default defineConfig({
  base: './',
  define: {
    __STATIC_ROOT__: RUNTIME_STATIC_ROOT,
    __RESOURCES_ROOT__: JSON.stringify(RESOURCES_ROOT),
  },
  server: {
    proxy: {
      // Dev proxy: at the dev root the API lives under `/api`.
      [`/${RESOURCES_ROOT}`]: {
        target: `https://localhost:${YETI_PORT}`,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  plugins: [react()],
  build: { outDir: '../web', emptyOutDir: true },
})
