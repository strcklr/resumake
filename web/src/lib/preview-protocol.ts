/** Messages between the page and the preview worker. */

export type ToWorker =
  /** Sent first: the site's base URL, where `pyodide/` and `py/` are served. */
  | { type: 'init'; base: string }
  | { type: 'render'; id: number; data: unknown };

export type FromWorker =
  | { type: 'status'; stage: string }
  | { type: 'ready' }
  | { type: 'failed'; error: string }
  | { type: 'rendered'; id: number; html: string }
  | { type: 'error'; id: number; error: string };
