<script lang="ts">
  import type { EditorView } from '@codemirror/view';
  import { onMount } from 'svelte';
  import sample from '../../resumes/default.yml?raw';
  import { download, loadDraft, saveDraft } from './lib/draft';
  import { createEditor, jumpTo, replaceDoc } from './lib/editor';
  import type { Problem } from './lib/validate';
  import GitHubSteps from './GitHubSteps.svelte';

  let host: HTMLDivElement;
  let fileInput: HTMLInputElement;
  let view: EditorView | undefined;

  let problems: Problem[] = $state([]);
  let checked = $state(false);
  let fileName = $state('resume.yml');

  const errors = $derived(problems.filter((p) => p.severity === 'error').length);
  const warnings = $derived(problems.length - errors);

  onMount(() => {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    view = createEditor({
      parent: host,
      doc: loadDraft() ?? sample,
      dark,
      onValidated: (text, found) => {
        problems = found;
        checked = true;
        saveDraft(text);
      },
    });
    return () => view?.destroy();
  });

  function loadSample() {
    if (view && confirm('Replace what is in the editor with the sample resume?')) {
      replaceDoc(view, sample);
      fileName = 'resume.yml';
    }
  }

  async function openFile(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file || !view) return;
    replaceDoc(view, await file.text());
    fileName = file.name;
    fileInput.value = '';
  }
</script>

<header class="top">
  <div class="brand">
    <span class="logo" aria-hidden="true">r</span>
    <div>
      <h1>resumake editor</h1>
      <p class="tag">Proof of concept · edits and checks one resume file in your browser</p>
    </div>
  </div>
  <div class="actions">
    <button type="button" onclick={loadSample}>Load sample</button>
    <button type="button" onclick={() => fileInput.click()}>Open .yml</button>
    <input bind:this={fileInput} type="file" accept=".yml,.yaml,text/yaml" hidden onchange={openFile} />
    <button type="button" class="primary" onclick={() => view && download(fileName, view.state.doc.toString())}>
      Download YAML
    </button>
  </div>
</header>

<main class="layout">
  <section class="editor-pane" aria-label="Editor">
    <div class="pane-head">
      <span class="file">{fileName}</span>
      <span class="hint">Ctrl+Space for field suggestions · draft saved in this browser</span>
    </div>
    <div class="editor" bind:this={host}></div>
  </section>

  <aside class="side">
    <section class="card" aria-live="polite">
      <h2>Validation</h2>
      {#if !checked}
        <p class="status muted">Checking…</p>
      {:else if errors === 0}
        <p class="status ok">
          <span class="dot" aria-hidden="true"></span>
          Valid resumake resume{warnings ? ` · ${warnings} warning${warnings === 1 ? '' : 's'}` : ''}
        </p>
      {:else}
        <p class="status bad">
          <span class="dot" aria-hidden="true"></span>
          {errors} problem{errors === 1 ? '' : 's'}{warnings ? ` · ${warnings} warning${warnings === 1 ? '' : 's'}` : ''}
        </p>
      {/if}

      {#if problems.length}
        <ul class="problems">
          {#each problems as p (p.from + p.message)}
            <li>
              <button type="button" class={p.severity} onclick={() => view && jumpTo(view, p.from, p.to)}>
                <span class="where">Line {p.line}{p.path ? ` · ${p.path}` : ''}</span>
                <span class="msg">{p.message}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      <p class="note">Checked against the same schema as <code>resumake validate</code>.</p>
    </section>

    <section class="card placeholder">
      <h2>Preview <span class="soon">Coming soon</span></h2>
      <p>
        A live preview rendered by resumake's own HTML template, running in your browser, is the next step.
        For now, run <code>resumake build</code> locally or let your repo's workflow build the PDF.
      </p>
    </section>

    <GitHubSteps />
  </aside>
</main>
