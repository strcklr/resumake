/** Page-side handle on the preview worker. */
import type { FromWorker, ToWorker } from './preview-protocol';

export interface PreviewEvents {
  onStatus: (stage: string) => void;
  onReady: () => void;
  onFailed: (error: string) => void;
  onRendered: (html: string) => void;
  onError: (error: string) => void;
  /** The gallery's renders (see renderGallery). */
  onGallery?: (items: { theme: string; html: string | null }[]) => void;
}

export class PreviewClient {
  private worker: Worker;
  private latest = 0;
  private latestGallery = 0;

  constructor(events: PreviewEvents) {
    this.worker = new Worker(new URL('./preview.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data: msg }: MessageEvent<FromWorker>) => {
      switch (msg.type) {
        case 'status':
          return events.onStatus(msg.stage);
        case 'ready':
          return events.onReady();
        case 'failed':
          return events.onFailed(msg.error);
        case 'rendered':
          // A newer request is on its way; this one is already out of date.
          if (msg.id === this.latest) events.onRendered(msg.html);
          return;
        case 'error':
          if (msg.id === this.latest) events.onError(msg.error);
          return;
        case 'gallery':
          if (msg.id === this.latestGallery) events.onGallery?.(msg.items);
          return;
      }
    };
    this.worker.onerror = (e) => events.onFailed(e.message || 'the preview worker stopped');
    // The page's own directory: `pyodide/` and `py/` are served next to index.html.
    this.post({ type: 'init', base: new URL('./', document.baseURI).href });
  }

  render(data: unknown): void {
    this.post({ type: 'render', id: ++this.latest, data });
  }

  /** Render `data` in each of `themes`, for the gallery. */
  renderGallery(data: unknown, themes: string[]): void {
    this.post({ type: 'gallery', id: ++this.latestGallery, data, themes });
  }

  destroy(): void {
    this.worker.terminate();
  }

  private post(msg: ToWorker) {
    this.worker.postMessage(msg);
  }
}
