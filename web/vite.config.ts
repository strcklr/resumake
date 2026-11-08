import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createReadStream, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Serve Pyodide's runtime from this site under `pyodide/` (dev server and build), instead of
 * from a CDN: the site then runs with no third-party requests.
 */
function selfHostPyodide(): Plugin {
  const dir = dirname(createRequire(import.meta.url).resolve('pyodide/package.json'));
  const files = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
  const types: Record<string, string> = {
    mjs: 'text/javascript',
    wasm: 'application/wasm',
    zip: 'application/zip',
    json: 'application/json',
  };
  return {
    name: 'self-host-pyodide',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split('?')[0].match(/\/pyodide\/([^/]+)$/)?.[1];
        if (!name || !files.includes(name)) return next();
        res.setHeader('Content-Type', types[name.split('.').pop()!]);
        createReadStream(join(dir, name)).pipe(res);
      });
    },
    generateBundle() {
      for (const name of files) {
        this.emitFile({ type: 'asset', fileName: `pyodide/${name}`, source: readFileSync(join(dir, name)) });
      }
    },
  };
}

export default defineConfig({
  plugins: [svelte(), selfHostPyodide()],
  // Relative asset paths, so the build works from any URL path (GitHub Pages, a subfolder, a file server).
  base: './',
  worker: { format: 'es' },
  // resumake's Python, templates and sample resume are imported straight from the repo,
  // so the site and the CLI share one copy.
  server: { fs: { allow: ['..'] } },
  // CodeMirror + Ajv in one bundle is ~230 kB gzipped; fine for now. Pyodide loads separately.
  build: { chunkSizeWarningLimit: 800 },
  // css: Vitest otherwise stubs every .css import (even ?raw) as empty; the preview needs the real stylesheet.
  test: { testTimeout: 60_000, css: true },
});
