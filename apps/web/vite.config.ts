import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
// Package roots (their export maps don't expose package.json, so go through node_modules).
const packageRoot = (name: string) => fs.realpathSync(path.join(here, 'node_modules', name));
const monacoRoot = packageRoot('monaco-editor');
const pyodideRoot = packageRoot('pyodide');
const excalidrawRoot = packageRoot('@excalidraw/excalidraw');

/** Serves Pyodide (Python in WebAssembly) from our own origin instead of a third-party CDN. */
function copyPyodide(): Plugin {
  const files = ['pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
  return {
    name: 'copy-pyodide',
    buildStart() {
      const out = path.join(here, 'public', 'pyodide');
      fs.mkdirSync(out, { recursive: true });
      for (const file of files) {
        const from = path.join(pyodideRoot, file);
        const to = path.join(out, file);
        if (!fs.existsSync(to) || fs.statSync(to).size !== fs.statSync(from).size) {
          fs.copyFileSync(from, to);
        }
      }
    },
  };
}

/** Serves Excalidraw's fonts from our own origin (it would otherwise fetch them from esm.sh). */
function copyExcalidrawFonts(): Plugin {
  return {
    name: 'copy-excalidraw-fonts',
    buildStart() {
      const from = path.join(excalidrawRoot, 'dist', 'prod', 'fonts');
      const to = path.join(here, 'public', 'excalidraw', 'fonts');
      const marker = path.join(to, '.version');
      const version = (
        JSON.parse(fs.readFileSync(path.join(excalidrawRoot, 'package.json'), 'utf8')) as {
          version: string;
        }
      ).version;
      if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === version) return;
      fs.rmSync(to, { recursive: true, force: true });
      fs.cpSync(from, to, { recursive: true });
      fs.writeFileSync(marker, version);
    },
  };
}

const apiTarget = process.env.VITE_DEV_API ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react(), tailwindcss(), copyPyodide(), copyExcalidrawFonts()],
  // Pre-bundle what the room's lazy chunks and the runner worker import, so opening them the
  // first time doesn't make Vite reload the page in development.
  optimizeDeps: {
    exclude: ['pyodide'],
    include: ['sucrase', 'y-monaco', '@excalidraw/excalidraw'],
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.join(here, 'src') },
      // y-monaco deep-imports monaco's ESM build by its file path, which monaco's
      // package "exports" map no longer allows.
      { find: /^monaco-editor\/esm\/vs\/(.*)$/, replacement: `${monacoRoot}/esm/vs/$1` },
    ],
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    // Maps are large (Monaco alone is ~10 MB); turn on when uploading them to error tracking.
    sourcemap: false,
  },
  server: {
    port: 5173,
    // The Worker (API + realtime) runs under `wrangler dev`; same-origin in dev and prod.
    proxy: {
      '/api': { target: apiTarget },
      '/collab': { target: apiTarget, ws: true },
    },
  },
});
