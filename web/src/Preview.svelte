<script lang="ts">
  /**
   * The rendered resume in an iframe, shown at Letter width and scaled to fit the pane.
   *
   * The iframe is sandboxed with scripts off. `allow-same-origin` lets this page write the HTML in
   * place (no white flash between updates) and measure its height; with scripts disabled the
   * resume itself can't use that access. Links open in a new tab.
   */
  import { onMount } from 'svelte';

  interface Props {
    html: string | null;
    /** Pyodide is still loading: the stage being loaded. */
    loading: string | null;
    /** Pyodide failed to load. */
    failed: string | null;
    /** The last render failed in Python. */
    error: string | null;
    /** The editor has errors, so this is the last valid version. */
    stale: boolean;
    /** Shown instead of the preview (e.g. a shared fragment, which isn't built on its own). */
    notice: string | null;
    fileName: string;
  }
  let { html, loading, failed, error, stale, notice, fileName }: Props = $props();

  const PX_PER_IN = 96;
  const PAGE_WIDTH = 8.5 * PX_PER_IN;
  // resumake's stylesheet: on screen the page has 0.75in padding; in print, 0.75in @page margins
  // on an 11in Letter page. So printed page n+1 starts about 0.75in + n × 9.5in down the screen layout.
  const MARGIN = 0.75 * PX_PER_IN;
  const PAGE_BODY = 9.5 * PX_PER_IN;

  let frame: HTMLIFrameElement;
  let paneWidth = $state(0);
  let contentHeight = $state(11 * PX_PER_IN);
  const scale = $derived(paneWidth ? Math.min(1, (paneWidth - 32) / PAGE_WIDTH) : 1);
  const breaks = $derived.by(() => {
    const out: number[] = [];
    for (let y = MARGIN + PAGE_BODY; y < contentHeight - MARGIN; y += PAGE_BODY) out.push(y);
    return out;
  });

  // Re-measure when the resume's layout changes (fonts arriving, the pane resizing).
  const ro = new ResizeObserver(() => measure());

  function withBase(source: string): string {
    return source.replace(/<head>/i, '<head><base target="_blank">');
  }

  function measure() {
    const doc = frame?.contentDocument;
    // The body, not the document: the document is at least as tall as the iframe, so it never shrinks.
    if (doc?.body) contentHeight = Math.max(doc.body.scrollHeight, 11 * PX_PER_IN);
  }

  $effect(() => {
    if (!html || !frame) return;
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(withBase(html));
    doc.close();
    measure();
    ro.disconnect();
    if (doc.body) ro.observe(doc.body);
    doc.fonts?.ready.then(measure);
  });

  onMount(() => () => ro.disconnect());

  function blobUrl(): string | null {
    return html ? URL.createObjectURL(new Blob([html], { type: 'text/html' })) : null;
  }

  function printPdf() {
    const url = blobUrl();
    if (!url) return;
    const win = window.open(url, '_blank');
    if (!win) return;
    win.addEventListener('load', () => {
      win.print();
      URL.revokeObjectURL(url);
    });
  }

  function downloadHtml() {
    const url = blobUrl();
    if (!url) return;
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: fileName.replace(/\.ya?ml$/i, '') + '.html',
    });
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="preview">
  <div class="preview-bar">
    <p class="preview-status" aria-live="polite">
      {#if notice}
        <span class="muted">{notice}</span>
      {:else if failed}
        <span class="bad">Preview unavailable: {failed}</span>
      {:else if loading && !html}
        <span class="spinner" aria-hidden="true"></span>{loading} <span class="muted">First visit downloads about 12 MB; later visits use the cache.</span>
      {:else if error}
        <span class="bad">Couldn't render: {error}</span>
      {:else if stale}
        <span class="warn">Showing the last valid version. Fix the problems to update it.</span>
      {:else if html}
        <span class="muted">Rendered by resumake's own template, as in the PDF. Dashed lines show roughly where pages break.</span>
      {/if}
    </p>
    <div class="preview-actions">
      <button type="button" onclick={printPdf} disabled={!html || !!notice} title="Opens the resume in a new tab and the print dialog: choose Save as PDF">
        Print / Save PDF
      </button>
      <button type="button" onclick={downloadHtml} disabled={!html || !!notice}>Download HTML</button>
    </div>
  </div>

  <div class="viewport" bind:clientWidth={paneWidth}>
    <div
      class="sheet"
      class:dim={stale || !!error}
      style:width="{PAGE_WIDTH * scale}px"
      style:height="{contentHeight * scale}px"
      hidden={!html || !!notice}
    >
      <div class="scaled" style:transform="scale({scale})" style:width="{PAGE_WIDTH}px">
        <iframe
          bind:this={frame}
          title="Resume preview"
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          style:height="{contentHeight}px"
        ></iframe>
        {#each breaks as y, i (y)}
          <div class="page-break" style:top="{y}px"><span>Page {i + 2}</span></div>
        {/each}
      </div>
    </div>
    {#if !html && !failed && !notice}
      <div class="sheet-placeholder" aria-hidden="true"></div>
    {/if}
  </div>
</div>

<style>
  .preview { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .preview-bar {
    display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; justify-content: space-between;
    padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border);
  }
  .preview-status { margin: 0; font-size: 0.8rem; flex: 1 1 14rem; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .preview-actions { display: flex; gap: 0.4rem; }
  .preview-actions button { font-size: 0.8rem; padding: 0.3rem 0.6rem; }
  .muted { color: var(--muted); }
  .bad { color: var(--bad); }
  .warn { color: var(--warn); }

  .viewport {
    flex: 1; min-height: 0; overflow: auto;
    background: var(--code-bg);
    padding: 16px;
  }
  .sheet {
    margin: 0 auto;
    background: #fff;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.15), 0 4px 16px rgb(0 0 0 / 0.08);
    overflow: hidden;
    transition: opacity 0.15s;
  }
  .sheet.dim { opacity: 0.55; }
  .scaled { position: relative; transform-origin: top left; }
  iframe { display: block; width: 100%; border: 0; background: #fff; }

  .page-break {
    position: absolute; left: 0; right: 0; height: 0;
    border-top: 1.5px dashed #7a8aa0;
    pointer-events: none;
  }
  .page-break span {
    position: absolute; right: 8px; top: 2px;
    font: 600 11px system-ui, sans-serif; color: #5d6877;
    background: #fff; padding: 0 4px;
  }

  .sheet-placeholder {
    margin: 0 auto; width: min(100%, 816px); aspect-ratio: 8.5 / 11;
    background: var(--surface); opacity: 0.6; border-radius: 2px;
  }
  .spinner {
    width: 0.8rem; height: 0.8rem; border-radius: 50%;
    border: 2px solid var(--border); border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
</style>
