<script lang="ts">
  /**
   * The rendered resume in an iframe, shown at Letter width and scaled to fit the pane.
   *
   * The iframe is sandboxed with scripts off. `allow-same-origin` lets this page write the HTML in
   * place (no white flash between updates) and measure its height; with scripts disabled the
   * resume itself can't use that access. Links open in a new tab.
   */
  import { onMount } from 'svelte';
  import type { ThemeInfo } from './lib/themes';

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
    /** When the files came from a linked GitHub repo: the number of unsaved changes, and how to save. */
    save?: { changes: number; repo: string; onSave: () => void } | null;
    /** The open resume's theme and accent, and how to change them (written into its YAML). */
    look?: Look | null;
  }
  export interface Look {
    /** Every theme to choose from: built-in and the repo's own. */
    themes: ThemeInfo[];
    theme: ThemeInfo;
    /** The accent in use (`#rrggbb`), or null when the theme has no colour. */
    accent: string | null;
    /** The open file sets its own accent (so it can be reset to the theme's or inherited one). */
    ownAccent: boolean;
    /** The file the choice is written to. */
    file: string;
    setTheme: (name: string) => void;
    setAccent: (hex: string | null) => void;
  }
  let { html, loading, failed, error, stale, notice, fileName, save = null, look = null }: Props = $props();

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
    {#if look && !notice}
      <div class="look">
        <label title={`${look.theme.description} Written to layout.theme in ${look.file}.`}>
          <span>Theme</span>
          <select value={look.theme.name} onchange={(e) => look.setTheme(e.currentTarget.value)}>
            {#each look.themes as t (t.name)}<option value={t.name}>{t.title}{t.custom ? ' (yours)' : ''}</option>{/each}
          </select>
        </label>
        {#if look.accent}
          <label class="accent" title={`Accent colour. Written to layout.accent in ${look.file}.`}>
            <span class="visually-hidden">Accent colour</span>
            <input type="color" value={look.accent} onchange={(e) => look.setAccent(e.currentTarget.value)} />
          </label>
          {#if look.ownAccent}
            <button type="button" class="reset" onclick={() => look.setAccent(null)} title={`Remove layout.accent from ${look.file}`}>
              Reset colour
            </button>
          {/if}
        {/if}
      </div>
    {/if}
    <div class="preview-actions">
      <button type="button" onclick={printPdf} disabled={!html || !!notice} title="Opens the resume in a new tab and the print dialog: choose Save as PDF">
        Print / Save PDF
      </button>
      <button type="button" onclick={downloadHtml} disabled={!html || !!notice}>Download HTML</button>
      {#if save}
        <button
          type="button"
          class="primary"
          onclick={save.onSave}
          disabled={!save.changes}
          title={save.changes ? `Save your changes to ${save.repo}` : 'No changes to save'}
        >
          Save to GitHub{#if save.changes}<span class="save-count">{save.changes}</span>{/if}
        </button>
      {/if}
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
  .preview-status { margin: 0; font-size: 0.8rem; flex: 1 1 100%; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .preview-actions { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-left: auto; }
  .look { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; }
  .look label { display: flex; align-items: center; gap: 0.35rem; }
  .look select { font: inherit; padding: 0.25rem 0.4rem; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: inherit; }
  .look input[type='color'] {
    width: 1.9rem; height: 1.6rem; padding: 0.1rem; border: 1px solid var(--border); border-radius: 6px;
    background: var(--surface); cursor: pointer;
  }
  .look .reset { font-size: 0.75rem; padding: 0.25rem 0.5rem; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .save-count {
    display: inline-block; min-width: 1.2rem; margin-left: 0.35rem; padding: 0 0.3rem; border-radius: 999px;
    font-size: 0.7rem; text-align: center; background: var(--accent-text); color: var(--accent);
  }
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
