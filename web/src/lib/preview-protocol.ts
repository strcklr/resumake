/** Messages between the page and the preview worker. */

export type ToWorker =
  /** Sent first: the site's base URL, where `pyodide/` and `py/` are served. */
  | { type: 'init'; base: string }
  | { type: 'render'; id: number; data: unknown }
  /** The resumes repo's own themes (ThemeFiles); renders after this can use them. */
  | { type: 'themes'; files: Record<string, string> }
  /** Render `data` once per theme, for the gallery. */
  | { type: 'gallery'; id: number; data: unknown; themes: string[] };

export type FromWorker =
  | { type: 'status'; stage: string }
  | { type: 'ready' }
  | { type: 'failed'; error: string }
  | { type: 'rendered'; id: number; html: string }
  | { type: 'error'; id: number; error: string }
  /** The gallery's renders, in the order asked; `html` is null where a theme failed to render. */
  | { type: 'gallery'; id: number; items: { theme: string; html: string | null }[] };
