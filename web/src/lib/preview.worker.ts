/// <reference lib="webworker" />
/**
 * Web Worker that renders the preview with resumake's Python, so loading Pyodide (~12 MB on the
 * first visit, then cached) and rendering never block typing.
 *
 * Pyodide's runtime is served from this site under `pyodide/` (see vite.config.ts) and the two
 * wheels from `py/`: no third-party CDN.
 */
import type { PyodideAPI } from 'pyodide';
import { installResumake, pythonError, WHEELS, type Render } from './pyrender';
import type { FromWorker, ToWorker } from './preview-protocol';

declare const self: DedicatedWorkerGlobalScope;

const send = (msg: FromWorker) => self.postMessage(msg);

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

// Only the newest request matters: while one renders, later ones replace each other.
let pending: Extract<ToWorker, { type: 'render' }> | null = null;
let busy = false;

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  if (msg.type === 'init') {
    ready ??= boot(msg.base);
    ready.catch((err) => send({ type: 'failed', error: pythonError(err) }));
    return;
  }
  pending = msg;
  if (busy || !ready) return;
  busy = true;
  try {
    const render = await ready;
    while (pending) {
      const { id, data } = pending;
      pending = null;
      try {
        send({ type: 'rendered', id, html: render(data) });
      } catch (err) {
        send({ type: 'error', id, error: pythonError(err) });
      }
    }
  } catch {
    /* boot failure already reported */
  } finally {
    busy = false;
  }
};
