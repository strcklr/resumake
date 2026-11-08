<script lang="ts">
  import type { EditorView } from '@codemirror/view';
  import { onMount } from 'svelte';
  import sample from '../../resumes/default.yml?raw';
  import GitHubSteps from './GitHubSteps.svelte';
  import Preview from './Preview.svelte';
  import Splash from './Splash.svelte';
  import { download, loadDraft, saveDraft } from './lib/draft';
  import { createEditor, jumpTo, replaceDoc } from './lib/editor';
  import { PreviewClient } from './lib/preview';
  import type { Problem } from './lib/validate';

  type Tab = 'preview' | 'problems' | 'github';

  // The Save to GitHub tab stays hidden until GitHub sign-in and saving are hooked up.
  const GITHUB_ENABLED = false;

  let host: HTMLDivElement;
  let fileInput: HTMLInputElement;
  let view: EditorView | undefined;
  let preview: PreviewClient | undefined;

  let problems: Problem[] = $state([]);
  let checked = $state(false);
  let fileName = $state('resume.yml');
  let tab: Tab = $state('preview');

  let html: string | null = $state(null);
  let loading: string | null = $state('Starting…');
  let failed: string | null = $state(null);
  let renderError: string | null = $state(null);

  const errors = $derived(problems.filter((p) => p.severity === 'error').length);
  const warnings = $derived(problems.length - errors);
  const stale = $derived(checked && errors > 0);

  onMount(() => {
    preview = new PreviewClient({
      onStatus: (stage) => (loading = stage),
      onReady: () => (loading = null),
      onFailed: (error) => {
        failed = error;
        loading = null;
      },
      onRendered: (out) => {
        html = out;
        renderError = null;
      },
      onError: (error) => (renderError = error),
    });

    view = createEditor({
      parent: host,
      doc: loadDraft() ?? sample,
      dark: matchMedia('(prefers-color-scheme: dark)').matches,
      onValidated: (text, found, data) => {
        problems = found;
        checked = true;
        saveDraft(text);
        // Render only what passes validation; otherwise keep showing the last good version.
        if (!found.some((p) => p.severity === 'error')) preview?.render(data);
      },
    });
    return () => {
      view?.destroy();
      preview?.destroy();
    };
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

  function showProblem(p: Problem) {
    if (view) jumpTo(view, p.from, p.to);
  }

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
</script>

<Splash />

<section id="editor" class="workspace" aria-label="Editor">
<header class="top">
  <a class="brand" href="#top" aria-label="resumake: back to the top">
    <span class="logo" aria-hidden="true">r</span>
    <div>
      <h1>resumake editor</h1>
      <p class="tag">Edit, check and preview one resume file in your browser</p>
    </div>
  </a>
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
  <section class="pane editor-pane" aria-label="Editor">
    <div class="pane-head">
      <span class="file">{fileName}</span>
      <button
        type="button"
        class="status-pill"
        class:ok={checked && errors === 0}
        class:bad={errors > 0}
        onclick={() => (tab = 'problems')}
        aria-live="polite"
      >
        <span class="dot" aria-hidden="true"></span>
        {#if !checked}
          Checking…
        {:else if errors}
          {plural(errors, 'problem')}
        {:else}
          Valid{warnings ? ` · ${plural(warnings, 'warning')}` : ''}
        {/if}
      </button>
    </div>
    <div class="editor" bind:this={host}></div>
    <p class="pane-foot">Ctrl+Space suggests fields · your draft is saved in this browser</p>
  </section>

  <section class="pane side-pane">
    <div class="tabs" role="tablist" aria-label="Side panel">
      <button role="tab" type="button" aria-selected={tab === 'preview'} onclick={() => (tab = 'preview')}>Preview</button>
      <button role="tab" type="button" aria-selected={tab === 'problems'} onclick={() => (tab = 'problems')}>
        Problems
        {#if problems.length}<span class="count" class:has-errors={errors > 0}>{problems.length}</span>{/if}
      </button>
      {#if GITHUB_ENABLED}
        <button role="tab" type="button" aria-selected={tab === 'github'} onclick={() => (tab = 'github')}>Save to GitHub</button>
      {/if}
    </div>

    <!-- Kept mounted while hidden, so the preview stays rendered and its scroll position survives. -->
    <div class="tab-body flush" role="tabpanel" hidden={tab !== 'preview'}>
      <Preview {html} {loading} {failed} error={renderError} {stale} {fileName} />
    </div>

    <div class="tab-body" role="tabpanel" hidden={tab !== 'problems'}>
      {#if !checked}
        <p class="status muted">Checking…</p>
      {:else if problems.length === 0}
        <p class="status ok"><span class="dot" aria-hidden="true"></span>No problems: this is a valid resumake resume.</p>
      {:else}
        <p class="status" class:bad={errors > 0}>
          <span class="dot" aria-hidden="true"></span>
          {errors ? plural(errors, 'problem') : ''}{errors && warnings ? ' · ' : ''}{warnings ? plural(warnings, 'warning') : ''}
        </p>
        <ul class="problems">
          {#each problems as p (p.from + p.message)}
            <li>
              <button type="button" class={p.severity} onclick={() => showProblem(p)}>
                <span class="where">Line {p.line}{p.path ? ` · ${p.path}` : ''}</span>
                <span class="msg">{p.message}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      <p class="note">Checked against the same schema as <code>resumake validate</code>.</p>
    </div>

    {#if GITHUB_ENABLED}
      <div class="tab-body" role="tabpanel" hidden={tab !== 'github'}>
        <GitHubSteps />
      </div>
    {/if}
  </section>
</main>
</section>
