<script lang="ts">
  /**
   * The files that inherit from `root`, drawn as a tree: the files that extend it directly below it,
   * the files that extend those below them, and so on. Click any file to open it.
   */
  interface Props {
    root: string;
    children: Map<string, string[]>;
    isPartial: (path: string) => boolean;
    onOpen: (path: string) => void;
  }
  let { root, children, isPartial, onOpen }: Props = $props();

  const count = $derived.by(() => {
    const seen = new Set<string>();
    const walk = (path: string) => (children.get(path) ?? []).forEach((k) => !seen.has(k) && k !== root && (seen.add(k), walk(k)));
    walk(root);
    return seen.size;
  });
</script>

{#snippet node(path: string, ancestors: string[])}
  {@const kids = (children.get(path) ?? []).filter((k) => !ancestors.includes(k))}
  <li>
    <button
      type="button"
      class="node"
      class:current={path === root}
      class:partial={isPartial(path)}
      aria-current={path === root ? 'true' : undefined}
      disabled={path === root}
      onclick={() => onOpen(path)}
    >
      <span class="node-name">{path}</span>
      {#if path === root}<span class="node-tag">this file</span>{/if}
    </button>
    {#if kids.length}
      <ul>
        {#each kids as kid (kid)}
          {@render node(kid, [...ancestors, path])}
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

<div class="graph">
  <p class="graph-help">
    {count === 1 ? '1 file inherits' : `${count} files inherit`} from <strong>{root}</strong>, directly or through
    another file. Each
    file extends the one above it; click one to open it.
  </p>
  <ul class="tree">
    {@render node(root, [])}
  </ul>
</div>

<style>
  .graph-help { margin: 0 0 0.9rem; font-size: 0.8rem; color: var(--muted); }
  .tree, .tree ul { list-style: none; margin: 0; padding: 0; }
  .tree ul { margin-left: 1.1rem; padding-left: 1rem; border-left: 1.5px solid var(--border); }
  .tree li { position: relative; padding-top: 0.45rem; }
  /* The elbow from the parent's line to each child. */
  .tree ul > li::before {
    content: '';
    position: absolute; left: -1rem; top: calc(0.45rem + 1rem); width: 0.85rem;
    border-top: 1.5px solid var(--border);
  }
  /* Stop the parent's vertical line at the last child's elbow. */
  .tree ul > li:last-child::after {
    content: '';
    position: absolute; left: calc(-1rem - 1.5px); top: calc(0.45rem + 1rem + 1.5px); bottom: 0;
    border-left: 1.5px solid var(--surface);
  }
  .node {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 0.45rem 0.7rem; border-radius: 6px; min-height: 2rem;
    border: 1px solid var(--border); background: var(--surface);
    font: 0.8rem ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--text);
  }
  .node:hover:not(:disabled) { border-color: var(--accent); }
  .node:disabled { cursor: default; opacity: 1; }
  .node.current { border-color: var(--accent); background: var(--code-bg); font-weight: 600; }
  .node.partial .node-name { font-style: italic; }
  .node-tag {
    font: 600 0.65rem system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--accent);
  }
</style>
