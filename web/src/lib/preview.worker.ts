/// <reference lib="webworker" />
/**
 * Web Worker that renders the preview with resumake's Python, so loading Pyodide (~12 MB on the
 * first visit, then cached) and rendering never block typing.
 *
 * Pyodide's runtime is served from this site under `pyodide/` (see vite.config.ts) and the two
 * wheels from `py/`: no third-party CDN.
 */
import type { PyodideAPI } from 'pyodide';
import { fontUrl, inlineFonts, installResumake, pythonError, WHEELS, type Render } from './pyrender';
import type { FromWorker, ToWorker } from './preview-protocol';

declare const self: DedicatedWorkerGlobalScope;

const send = (msg: FromWorker) => self.postMessage(msg);

let siteBase = '';
/**
 * Fonts as data: URLs, by `<theme>/<file>`: each is fetched once, the first time a theme is used.
 * A font that fails to load is left out (the stylesheet's fallback fonts take over) and retried next time.
 */
const fontCache = new Map<string, Promise<string>>();

function loadFont(theme: string, file: string): Promise<string> {
  const key = `${theme}/${file}`;
  let font = fontCache.get(key);
  if (!font) {
    font = (async () => {
      const url = fontUrl(theme, file);
      if (!url) throw new Error(`no font ${key}`);
      const res = await fetch(new URL(url, siteBase));
      if (!res.ok) throw new Error(`could not load the font ${file} (HTTP ${res.status})`);
      return `data:font/woff2;base64,${base64(new Uint8Array(await res.arrayBuffer()))}`;
    })();
    font.catch(() => fontCache.delete(key)); // try again next render
    fontCache.set(key, font);
  }
  return font;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function boot(base: string): Promise<Render> {
  send({ type: 'status', stage: 'Loading Python…' });
  const indexURL = new URL('pyodide/', base).href;
  const { loadPyodide } = (await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`)) as {
    loadPyodide: (opts: { indexURL: string }) => Promise<PyodideAPI>;
  };
  const [py, wheels] = await Promise.all([
    loadPyodide({ indexURL }),
    Promise.all(
      WHEELS.map(async (name) => {
        const res = await fetch(new URL(`py/${name}`, base));
        if (!res.ok) throw new Error(`could not load ${name} (HTTP ${res.status})`);
        return res.arrayBuffer();
      }),
    ),
  ]);
  send({ type: 'status', stage: 'Loading resumake…' });
  const render = installResumake(py, wheels);
  send({ type: 'ready' });
  return render;
}

let ready: Promise<Render> | undefined;

// Only the newest request of each kind matters: while one renders, later ones replace each other.
// The preview goes first; the gallery (several renders) waits behind it.
let pending: Extract<ToWorker, { type: 'render' }> | null = null;
let pendingGallery: Extract<ToWorker, { type: 'gallery' }> | null = null;
let busy = false;

const fonts = (theme: string, file: string) => loadFont(theme, file).catch(() => '');

/** The same resume with another theme (keeping the rest of its layout, accent included). */
function withTheme(data: unknown, theme: string): unknown {
  const resume = data as { layout?: object };
  return { ...resume, layout: { ...resume.layout, theme } };
}

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  if (msg.type === 'init') {
    siteBase ||= msg.base;
    ready ??= boot(msg.base);
    ready.catch((err) => send({ type: 'failed', error: pythonError(err) }));
    return;
  }
  if (msg.type === 'themes') {
    const files = msg.files;
    // Applied in order with renders: a render after this message sees these themes.
    if (!ready) return;
    const next = ready.then((render) => {
      try {
        render.setRepoThemes(files);
      } catch {
        /* a broken theme shows up as a render error when it's used */
      }
      return render;
    });
    next.catch(() => {}); // a boot failure is already reported
    ready = next;
    return;
  }
  if (msg.type === 'gallery') pendingGallery = msg;
  else pending = msg;
  if (busy || !ready) return;
  busy = true;
  try {
    const render = await ready;
    while (pending || pendingGallery) {
      if (pending) {
        const { id, data } = pending;
        pending = null;
        try {
          send({ type: 'rendered', id, html: await inlineFonts(render(data), fonts) });
        } catch (err) {
          send({ type: 'error', id, error: pythonError(err) });
        }
        continue;
      }
      const { id, data, themes } = pendingGallery!;
      pendingGallery = null;
      const items = [];
      for (const theme of themes) {
        let html: string | null = null;
        try {
          html = await inlineFonts(render(withTheme(data, theme)), fonts);
        } catch {
          /* shown as unavailable */
        }
        items.push({ theme, html });
        if (pending) break; // a newer preview is waiting; this gallery will be asked for again
      }
      if (items.length === themes.length) send({ type: 'gallery', id, items });
      else pendingGallery ??= { type: 'gallery', id, data, themes };
    }
  } catch {
    /* boot failure already reported */
  } finally {
    busy = false;
  }
};
