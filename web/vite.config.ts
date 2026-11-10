import { svelte } from '@sveltejs/vite-plugin-svelte';
import Ajv2020 from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { createReadStream, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { analyticsConfig, scriptTag, type AnalyticsConfig } from './src/lib/analytics';

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

/**
 * The resume validator, compiled from src/lib/schema.json at build time (Ajv's standalone mode).
 * Ajv normally builds its validator with `new Function` in the browser, which the Content Security
 * Policy below forbids; precompiling also keeps Ajv's compiler out of the bundle.
 */
function precompiledValidator(): Plugin {
  const id = 'virtual:resume-validator';
  const schemaPath = new URL('./src/lib/schema.json', import.meta.url);
  return {
    name: 'precompiled-validator',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load(source) {
      if (source !== `\0${id}`) return;
      this.addWatchFile(schemaPath.pathname);
      const ajv = new Ajv2020({ allErrors: true, strict: false, verbose: true, code: { source: true, esm: true } });
      return standaloneCode(ajv, ajv.compile(JSON.parse(readFileSync(schemaPath, 'utf8'))));
    },
  };
}

/**
 * A strict Content Security Policy for the built site (the dev server needs inline scripts, so it's
 * build-only). The page can run only its own scripts (plus Umami's, when usage counting is configured),
 * compile WebAssembly (Pyodide), and connect only to itself, GitHub's API, the sign-in Worker and Umami. That limits what an injected script could do with a
 * GitHub token. Inline styles are allowed: CodeMirror, Svelte and the resume's own template use them.
 */
function contentSecurityPolicy(): Plugin {
  let connect = "'self' https://api.github.com";
  let script = "'self' 'wasm-unsafe-eval'";
  let analytics: AnalyticsConfig | null = null;
  return {
    name: 'content-security-policy',
    apply: 'build',
    configResolved(cfg) {
      const auth = cfg.env.VITE_AUTH_URL as string | undefined;
      if (auth) connect += ` ${new URL(auth).origin}`;
      // Usage counts (strcklr/resumake#24): only when configured, and only Umami's own origin.
      analytics = analyticsConfig(cfg.env);
      if (analytics) {
        const origin = new URL(analytics.src).origin;
        script += ` ${origin}`;
        connect += ` ${origin}`;
      }
    },
    transformIndexHtml(html) {
      if (analytics) html = html.replace('</head>', `  ${scriptTag(analytics)}\n  </head>`);
      const policy = [
        "default-src 'self'",
        `script-src ${script}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        `connect-src ${connect}`,
        "worker-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
      ].join('; ');
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    },
  };
}

export default defineConfig({
  plugins: [svelte(), precompiledValidator(), selfHostPyodide(), contentSecurityPolicy()],
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
