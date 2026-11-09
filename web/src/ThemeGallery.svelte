<script lang="ts">
  /**
   * The open resume in every theme, as first-page thumbnails. Picking one sets `layout.theme` in the
   * open file, like the theme picker above the preview.
   *
   * Each thumbnail is a sandboxed iframe with no permissions (no scripts, no same-origin access),
   * drawn at Letter width and scaled down; clicks go to the card, not the page inside it.
   */
  import { THEMES } from './lib/themes';

  interface Props {
    /** The renders, by theme name; null until the first gallery render arrives. */
    items: Record<string, string | null> | null;
    /** The theme the open resume uses now. */
    current: string;
    /** The file a pick is written to. */
    file: string;
    /** The resume has errors, so these show its last valid version. */
    stale: boolean;
    onPick: (name: string) => void;
  }
  let { items, current, file, stale, onPick }: Props = $props();

  const PAGE_WIDTH = 8.5 * 96;
  const PAGE_HEIGHT = 11 * 96;
  const SCALE = 0.25;
</script>

<p class="note first">
  Your resume in each theme. Pick one to use it: that sets <code>layout.theme</code> in <strong>{file}</strong>.
  {#if stale}<span class="warn">Showing the last valid version.</span>{/if}
</p>

<ul class="gallery" style:--thumb-w="{PAGE_WIDTH * SCALE}px" style:--thumb-h="{PAGE_HEIGHT * SCALE}px">
  {#each THEMES as theme (theme.name)}
    {@const html = items?.[theme.name]}
    <li>
      <button
        type="button"
        class="card"
        class:current={theme.name === current}
        aria-pressed={theme.name === current}
        title={theme.description}
        onclick={() => onPick(theme.name)}
      >
        <span class="thumb" class:dim={stale}>
          {#if html}
            <iframe
              title={`${theme.title} preview`}
              srcdoc={html}
              sandbox=""
              tabindex="-1"
              aria-hidden="true"
              style:width="{PAGE_WIDTH}px"
              style:height="{PAGE_HEIGHT}px"
              style:transform="scale({SCALE})"
            ></iframe>
          {:else if items}
            <span class="placeholder">Couldn't render</span>
          {:else}
            <span class="placeholder"><span class="spinner" aria-hidden="true"></span></span>
          {/if}
        </span>
        <span class="name">
          {theme.title}
          {#if theme.name === current}<span class="badge">In use</span>{/if}
        </span>
        <span class="desc">{theme.description}</span>
      </button>
    </li>
  {/each}
</ul>

<style>
  .gallery {
    list-style: none; margin: 0.8rem 0 0; padding: 0;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(calc(var(--thumb-w) + 18px), 1fr)); gap: 0.9rem;
  }
  .card {
    width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; gap: 0.35rem;
    padding: 8px; text-align: left; font: inherit; color: inherit;
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px; cursor: pointer;
  }
  .card:hover { border-color: var(--muted); }
  .card.current { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .thumb {
    position: relative; width: var(--thumb-w); height: var(--thumb-h); overflow: hidden;
    background: #fff; border-radius: 2px; box-shadow: 0 1px 3px rgb(0 0 0 / 0.18);
    transition: opacity 0.15s;
  }
  .thumb.dim { opacity: 0.55; }
  iframe { display: block; border: 0; background: #fff; transform-origin: top left; pointer-events: none; }
  .placeholder { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #666; font-size: 0.75rem; }
  .name { align-self: stretch; display: flex; align-items: center; gap: 0.4rem; font-weight: 600; font-size: 0.85rem; }
  .badge {
    font-size: 0.65rem; font-weight: 600; padding: 0.05rem 0.4rem; border-radius: 999px;
    background: var(--accent); color: var(--accent-text);
  }
  .desc { align-self: stretch; font-size: 0.75rem; color: var(--muted); line-height: 1.35; }
  .warn { color: var(--warn); }
  .spinner {
    width: 1rem; height: 1rem; border-radius: 50%;
    border: 2px solid #ddd; border-top-color: #888;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
</style>
