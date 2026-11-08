<script lang="ts">
  import type { EditorState } from '@codemirror/state';
  import { onMount } from 'svelte';
  import Footer from './Footer.svelte';
  import GitHubSteps from './GitHubSteps.svelte';
  import Preview from './Preview.svelte';
  import Splash from './Splash.svelte';
  import { createEditor, jumpTo, type Editor } from './lib/editor';
  import {
    BASE_FILE,
    download,
    invalidName,
    loadWorkspace,
    newVariant,
    outputName,
    readPicked,
    sampleWorkspace,
    saveWorkspace,
    sortPaths,
    zipFiles,
  } from './lib/files';
  import { PreviewClient } from './lib/preview';
  import { formatPath } from './lib/validate';
  import {
    inheritedFields,
    isPartial,
    Workspace,
    type FileProblem,
    type Inherited,
    type Resolved,
  } from './lib/workspace';

  type Tab = 'preview' | 'problems' | 'inherited' | 'github';

  // The Save to GitHub tab stays hidden until GitHub sign-in and saving are hooked up.
  const GITHUB_ENABLED = false;

  const saved = loadWorkspace();
  let files: Record<string, string> = $state(saved.files);
  let active = $state(saved.active);
  // Each file keeps its own editor state (undo history, selection) while you switch between them.
  const states = new Map<string, EditorState>();

  let host: HTMLDivElement;
  let filesInput: HTMLInputElement;
  let folderInput: HTMLInputElement;
  let editor: Editor | undefined;
  let preview: PreviewClient | undefined;

  let resolved = $state<Resolved | null>(null);
  let tab: Tab = $state('preview');

  let html: string | null = $state(null);
  let loading: string | null = $state('Starting…');
  let failed: string | null = $state(null);
  let renderError: string | null = $state(null);

  const paths = $derived(sortPaths(Object.keys(files)));
  const problems = $derived(resolved?.problems ?? []);
  const checked = $derived(resolved !== null);
  const errors = $derived(problems.filter((p) => p.severity === 'error').length);
  const warnings = $derived(problems.length - errors);
  const stale = $derived(checked && errors > 0);
  const filesWithErrors = $derived(new Set(problems.filter((p) => p.severity === 'error').map((p) => p.file)));
  const inherited: Inherited[] = $derived(resolved?.origin ? inheritedFields(resolved.origin, active) : []);
  const partial = $derived(isPartial(active));
  const notice = $derived(
    partial ? "This is a shared fragment: other files can extend it, but it isn't built on its own." : null,
  );

  /** Check the open file against the whole workspace; called by the editor as you type. */
  function check(text: string) {
    files[active] = text;
    const snapshot = $state.snapshot(files);
    const result = new Workspace(snapshot).resolve(active);
    resolved = result;
    saveWorkspace({ files: snapshot, active });
    // Render only what passes validation; otherwise keep showing the last good version.
    if (!partial && result.data && !result.problems.some((p) => p.severity === 'error')) preview?.render(result.data);
    return result.problems.filter((p) => p.file === active);
  }

  /** Show a file in the editor, optionally selecting a range in it. */
  function open(path: string, range?: readonly [number, number]) {
    if (!editor) return;
    if (path !== active) {
      states.set(active, editor.view.state);
      active = path;
      resolved = null;
      editor.view.setState(states.get(path) ?? editor.stateFor(files[path]));
      saveWorkspace({ files: $state.snapshot(files), active });
    }
    if (range) jumpTo(editor.view, range[0], range[1]);
  }

  /** Replace every file (sample, opened folder) and show `first`. */
  function replaceAll(next: Record<string, string>, first: string) {
    states.clear();
    files = next;
    active = first;
    resolved = null;
    editor?.view.setState(editor.stateFor(next[first]));
    saveWorkspace({ files: next, active: first });
  }

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
    editor = createEditor({ parent: host, dark: matchMedia('(prefers-color-scheme: dark)').matches, check });
    editor.view.setState(editor.stateFor(files[active]));
    return () => {
      editor?.view.destroy();
      preview?.destroy();
    };
  });

  function askName(message: string, suggestion: string, current?: string): string | null {
    let name = prompt(message, suggestion);
    while (name !== null) {
      name = name.trim();
      const problem = invalidName(name, files, current);
      if (!problem) return name;
      name = prompt(`${problem}\n\n${message}`, name);
    }
    return null;
  }

  function newFile() {
    const name = askName('Name for the new file, e.g. tailored/acme.yml:', 'tailored/new-role.yml');
    if (!name) return;
    const base = BASE_FILE in files ? BASE_FILE : paths.find((p) => !isPartial(p));
    files[name] = newVariant(name, base);
    open(name);
  }

  function renameFile() {
    const name = askName(`Rename ${active} to:`, active, active);
    if (!name || name === active || !editor) return;
    const state = editor.view.state;
    const text = files[active];
    states.delete(active);
    delete files[active];
    files[name] = text;
    states.set(name, state);
    active = name;
    resolved = null;
    editor.view.setState(state);
    saveWorkspace({ files: $state.snapshot(files), active });
  }

  function deleteFile() {
    if (paths.length === 1) {
      alert('Keep at least one file. To start over, use Load sample.');
      return;
    }
    if (!confirm(`Delete ${active}? Files that extend it will stop resolving.`)) return;
    const gone = active;
    const next = paths.find((p) => p !== gone)!;
    states.delete(gone);
    delete files[gone];
    active = next;
    resolved = null;
    editor?.view.setState(states.get(next) ?? editor.stateFor(files[next]));
    saveWorkspace({ files: $state.snapshot(files), active });
  }

  function loadSample() {
    if (confirm('Replace all your files with the sample resume and its tailored variant?')) {
      const sample = sampleWorkspace();
      replaceAll(sample.files, sample.active);
    }
  }

  async function openFiles(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const picked = await readPicked(input.files!);
    input.value = '';
    const names = Object.keys(picked);
    if (!names.length) return;
    const overwriting = names.filter((n) => n in files);
    if (overwriting.length && !confirm(`Replace ${overwriting.join(', ')} with the file you opened?`)) return;
    for (const [name, text] of Object.entries(picked)) {
      files[name] = text;
      states.delete(name);
    }
    if (names.includes(active)) {
      resolved = null;
      editor?.view.setState(editor.stateFor(files[active]));
    } else open(names[0]);
  }

  async function openFolder(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const picked = await readPicked(input.files!);
    input.value = '';
    const names = sortPaths(Object.keys(picked));
    if (!names.length) {
      alert('That folder has no .yml or .yaml files.');
      return;
    }
    if (!confirm(`Replace all your files with the ${names.length} resume file${names.length === 1 ? '' : 's'} in that folder?`)) return;
    replaceAll(picked, names.includes(BASE_FILE) ? BASE_FILE : names[0]);
  }

  function downloadFile() {
    download(active.split('/').pop()!, files[active]);
  }

  function downloadAll() {
    download('resumes.zip', zipFiles($state.snapshot(files)), 'application/zip');
  }

  function showProblem(p: FileProblem) {
    open(p.file, [p.from, p.to]);
  }

  function showInherited(item: Inherited) {
    open(item.file, new Workspace($state.snapshot(files)).range(item.file, item.segments));
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
      <p class="tag">Edit, check and preview your resumes in your browser</p>
    </div>
  </a>
  <div class="actions">
    <button type="button" onclick={loadSample}>Load sample</button>
    <button type="button" onclick={() => filesInput.click()}>Open files</button>
    <button type="button" onclick={() => folderInput.click()}>Open folder</button>
    <input bind:this={filesInput} type="file" accept=".yml,.yaml,text/yaml" multiple hidden onchange={openFiles} />
    <input bind:this={folderInput} type="file" webkitdirectory hidden onchange={openFolder} />
    <button type="button" class="primary" onclick={downloadAll} title="Every file, in its folder, as one .zip">
      Download all
    </button>
  </div>
</header>

<main class="layout">
  <section class="pane editor-pane" aria-label="Editor">
    <div class="pane-head files-head">
      <div class="file-tabs" role="tablist" aria-label="Files">
        {#each paths as path (path)}
          <button
            type="button"
            role="tab"
            class="file-tab"
            class:partial={isPartial(path)}
            aria-selected={path === active}
            title={isPartial(path) ? `${path} (shared fragment)` : path}
            onclick={() => open(path)}
          >
            {#if filesWithErrors.has(path)}<span class="file-error" title="Has problems"></span>{/if}
            {path}
          </button>
        {/each}
        <button type="button" class="file-add" onclick={newFile} title="New tailored file" aria-label="New file">+</button>
      </div>
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
    <div class="pane-foot">
      <div class="file-actions">
        <button type="button" class="link" onclick={renameFile}>Rename</button>
        <button type="button" class="link" onclick={deleteFile}>Delete</button>
        <button type="button" class="link" onclick={downloadFile}>Download this file</button>
      </div>
      <span>Ctrl+Space suggests fields · saved in this browser</span>
    </div>
  </section>

  <section class="pane side-pane">
    <div class="tabs" role="tablist" aria-label="Side panel">
      <button role="tab" type="button" aria-selected={tab === 'preview'} onclick={() => (tab = 'preview')}>Preview</button>
      <button role="tab" type="button" aria-selected={tab === 'problems'} onclick={() => (tab = 'problems')}>
        Problems
        {#if problems.length}<span class="count" class:has-errors={errors > 0}>{problems.length}</span>{/if}
      </button>
      {#if inherited.length}
        <button role="tab" type="button" aria-selected={tab === 'inherited'} onclick={() => (tab = 'inherited')}>
          Inherited <span class="count">{inherited.length}</span>
        </button>
      {/if}
      {#if GITHUB_ENABLED}
        <button role="tab" type="button" aria-selected={tab === 'github'} onclick={() => (tab = 'github')}>Save to GitHub</button>
      {/if}
    </div>

    <!-- Kept mounted while hidden, so the preview stays rendered and its scroll position survives. -->
    <div class="tab-body flush" role="tabpanel" hidden={tab !== 'preview'}>
      <Preview {html} {loading} {failed} error={renderError} {stale} {notice} fileName={`${outputName(active)}.yml`} />
    </div>

    <div class="tab-body" role="tabpanel" hidden={tab !== 'problems'}>
      {#if !checked}
        <p class="status muted">Checking…</p>
      {:else if problems.length === 0}
        <p class="status ok">
          <span class="dot" aria-hidden="true"></span>
          {partial ? 'No problems in this shared fragment.' : 'No problems: this is a valid resumake resume.'}
        </p>
      {:else}
        <p class="status" class:bad={errors > 0}>
          <span class="dot" aria-hidden="true"></span>
          {errors ? plural(errors, 'problem') : ''}{errors && warnings ? ' · ' : ''}{warnings ? plural(warnings, 'warning') : ''}
        </p>
        <ul class="problems">
          {#each problems as p (`${p.file}:${p.from}:${p.message}`)}
            <li>
              <button type="button" class={p.severity} onclick={() => showProblem(p)}>
                <span class="where">{p.file} · line {p.line}{p.path ? ` · ${p.path}` : ''}</span>
                <span class="msg">{p.message}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      <p class="note">
        Checked against the same schema as <code>resumake validate</code>, with <code>extends:</code> resolved across
        your files.
      </p>
    </div>

    {#if inherited.length}
      <div class="tab-body" role="tabpanel" hidden={tab !== 'inherited'}>
        <p class="note first">
          These come from the files <strong>{active}</strong> extends. Set one here to override it, or set it to
          <code>null</code> to remove it.
        </p>
        <ul class="problems inherited">
          {#each inherited as item (`${item.file}:${item.segments.join('.')}`)}
            <li>
              <button type="button" onclick={() => showInherited(item)}>
                <span class="msg"><code>{formatPath(item.segments)}</code></span>
                <span class="where">from {item.file}</span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if GITHUB_ENABLED}
      <div class="tab-body" role="tabpanel" hidden={tab !== 'github'}>
        <GitHubSteps />
      </div>
    {/if}
  </section>
</main>
</section>

<Footer />
