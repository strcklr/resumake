<script lang="ts">
  import type { EditorState } from '@codemirror/state';
  import { onMount } from 'svelte';
  import FamilyGraph from './FamilyGraph.svelte';
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
    neighbor,
    newVariant,
    outputName,
    readPicked,
    sampleWorkspace,
    saveWorkspace,
    sortPaths,
    zipFiles,
    type Source,
  } from './lib/files';
  import { diffFiles, type LoadedRepo } from './lib/github';
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

  type Tab = 'preview' | 'problems' | 'inherited' | 'graph' | 'github';

  // The GitHub tab: creating a repo from the template works; sign-in and saving arrive with #5.
  const GITHUB_ENABLED = true;

  const saved = loadWorkspace();
  let files: Record<string, string> = $state(saved.files);
  let active = $state(saved.active);
  /** Files open as tabs. Closing a tab keeps the file, so variants that extend it still resolve. */
  let tabs = $state(saved.tabs);
  /** The GitHub repo the files came from; cleared when they're replaced from elsewhere. */
  let source = $state<Source | null>(saved.source ?? null);
  // Coming back from GitHub sign-in lands on the GitHub tab.
  const returningFromGitHub = new URLSearchParams(window.location.search).has('code');
  let filesMenuOpen = $state(false);
  // Each file keeps its own editor state (undo history, selection) while you switch between them.
  const states = new Map<string, EditorState>();

  let host: HTMLDivElement;
  let filesInput: HTMLInputElement;
  let folderInput: HTMLInputElement;
  let editor: Editor | undefined;
  let preview: PreviewClient | undefined;

  let resolved = $state<Resolved | null>(null);
  let tab: Tab = $state(returningFromGitHub ? 'github' : 'preview');

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
  /** Unsaved changes since the files were opened from GitHub (0 when they didn't come from GitHub). */
  const unsaved = $derived.by(() => {
    if (!source?.base) return 0;
    const d = diffFiles(source.base, files);
    return d.added.length + d.modified.length + d.deleted.length;
  });
  // The extends: links between files, from every file in the workspace (open in a tab or not).
  const graph = $derived(new Workspace($state.snapshot(files)));
  const children = $derived(graph.childrenMap());
  const extendedBy = $derived(children.get(active) ?? []);
  // Fall back to the preview when switching to a file that doesn't have the open tab.
  $effect(() => {
    if ((tab === 'inherited' && !inherited.length) || (tab === 'graph' && !extendedBy.length)) tab = 'preview';
  });
  const notice = $derived(
    partial ? "This is a shared fragment: other files can extend it, but it isn't built on its own." : null,
  );

  /** Check the open file against the whole workspace; called by the editor as you type. */
  function check(text: string) {
    files[active] = text;
    const snapshot = $state.snapshot(files);
    const result = new Workspace(snapshot).resolve(active);
    resolved = result;
    persist(snapshot);
    // Render only what passes validation; otherwise keep showing the last good version.
    if (!partial && result.data && !result.problems.some((p) => p.severity === 'error')) preview?.render(result.data);
    return result.problems.filter((p) => p.file === active);
  }

  function persist(snapshot = $state.snapshot(files)) {
    saveWorkspace({ files: snapshot, active, tabs: $state.snapshot(tabs), source: $state.snapshot(source) });
  }

  /** Show a file in the editor (opening its tab if it's closed), optionally selecting a range in it. */
  function open(path: string, range?: readonly [number, number]) {
    if (!editor) return;
    filesMenuOpen = false;
    if (!tabs.includes(path)) tabs.push(path);
    if (path !== active) {
      states.set(active, editor.view.state);
      active = path;
      resolved = null;
      editor.view.setState(states.get(path) ?? editor.stateFor(files[path]));
    }
    persist();
    if (range) jumpTo(editor.view, range[0], range[1]);
  }

  /** Close a tab. The file stays; reopen it from the Files list. The last open tab can't close. */
  function closeTab(path: string) {
    if (tabs.length === 1) return;
    const next = neighbor(tabs, path)!;
    if (path === active) open(next);
    tabs = tabs.filter((t) => t !== path);
    persist();
  }

  /** Replace every file (sample, opened folder) and show `first`. */
  function replaceAll(next: Record<string, string>, first: string, openTabs: string[], from: Source | null = null) {
    states.clear();
    source = from;
    files = next;
    active = first;
    tabs = openTabs;
    resolved = null;
    editor?.view.setState(editor.stateFor(next[first]));
    persist(next);
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
    if (returningFromGitHub) document.getElementById('editor')?.scrollIntoView();
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
    tabs = tabs.map((t) => (t === active ? name : t));
    active = name;
    resolved = null;
    editor.view.setState(state);
    persist();
  }

  function deleteFile() {
    if (paths.length === 1) {
      alert('Keep at least one file. To start over, use Load sample.');
      return;
    }
    if (!confirm(`Delete ${active}? Files that extend it will stop resolving.`)) return;
    const gone = active;
    const next = neighbor(tabs, gone) ?? paths.find((p) => p !== gone)!;
    states.delete(gone);
    delete files[gone];
    tabs = tabs.filter((t) => t !== gone);
    if (!tabs.includes(next)) tabs.push(next);
    active = next;
    resolved = null;
    editor?.view.setState(states.get(next) ?? editor.stateFor(files[next]));
    persist();
  }

  function loadSample() {
    if (confirm('Replace all your files with the sample resume and its tailored variant?')) {
      const sample = sampleWorkspace();
      replaceAll(sample.files, sample.active, sample.tabs);
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
    for (const name of names) if (!tabs.includes(name)) tabs.push(name);
    if (names.includes(active)) {
      resolved = null;
      editor?.view.setState(editor.stateFor(files[active]));
      persist();
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
    // Every file opens as a tab, base file first, so it's clear what was loaded.
    replaceAll(picked, names.includes(BASE_FILE) ? BASE_FILE : names[0], names);
  }

  /** Put a GitHub repo's resumes in the editor, replacing what's here (after asking). */
  function openFromGitHub(loaded: LoadedRepo): boolean {
    const names = sortPaths(Object.keys(loaded.files));
    const ok = confirm(
      `Replace the files in this browser with the ${names.length} file${names.length === 1 ? '' : 's'} from ${loaded.repo}?` +
        '\n\nDownload all first if you want to keep what is here.',
    );
    if (!ok) return false;
    // Every file opens as a tab, base file first, so it's clear what was loaded.
    replaceAll(loaded.files, names.includes(BASE_FILE) ? BASE_FILE : names[0], names, {
      repo: loaded.repo,
      defaultBranch: loaded.defaultBranch,
      branch: loaded.branch,
      commit: loaded.commit,
      folder: loaded.folder,
      base: { ...loaded.files },
    });
    tab = 'preview';
    return true;
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

<svelte:window
  onkeydown={(e) => e.key === 'Escape' && (filesMenuOpen = false)}
  onblur={() => (filesMenuOpen = false)}
  onclick={(e) => filesMenuOpen && !(e.target as Element).closest('.files-menu') && (filesMenuOpen = false)}
/>

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
    {#if unsaved}
      <button type="button" class="primary" onclick={() => (tab = 'github')} title={`Save your changes to ${source?.repo}`}>
        Save to GitHub <span class="count save-count">{unsaved}</span>
      </button>
      <button type="button" onclick={downloadAll} title="Every file, in its folder, as one .zip">Download all</button>
    {:else}
      <button type="button" class="primary" onclick={downloadAll} title="Every file, in its folder, as one .zip">
        Download all
      </button>
    {/if}
  </div>
</header>

<main class="layout">
  <section class="pane editor-pane" aria-label="Editor">
    <div class="pane-head files-head">
      <div class="files-menu">
        <button
          type="button"
          class="files-toggle"
          aria-expanded={filesMenuOpen}
          aria-controls="files-list"
          title="All files"
          onclick={() => (filesMenuOpen = !filesMenuOpen)}
        >
          Files <span class="count">{paths.length}</span>
        </button>
        {#if filesMenuOpen}
          <ul id="files-list" class="files-list">
            {#each paths as path (path)}
              <li>
                <button type="button" class:current={path === active} onclick={() => open(path)}>
                  {#if filesWithErrors.has(path)}<span class="file-error" title="Has problems"></span>{/if}
                  <span class="files-list-name" class:partial={isPartial(path)}>{path}</span>
                  {#if !tabs.includes(path)}<span class="files-list-closed">closed</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      <div class="file-tabs" role="tablist" aria-label="Open files">
        {#each tabs as path (path)}
          <div class="file-tab" class:partial={isPartial(path)} class:current={path === active}>
            <button
              type="button"
              role="tab"
              aria-selected={path === active}
              title={isPartial(path) ? `${path} (shared fragment)` : path}
              onclick={() => open(path)}
              onauxclick={(e) => e.button === 1 && closeTab(path)}
            >
              {#if filesWithErrors.has(path)}<span class="file-error" title="Has problems"></span>{/if}
              {path}
            </button>
            {#if tabs.length > 1}
              <button type="button" class="tab-close" aria-label={`Close ${path}`} title="Close tab (the file is kept)" onclick={() => closeTab(path)}>×</button>
            {/if}
          </div>
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
      <span>
        Ctrl+Space suggests fields ·
        {#if source}from <strong>{source.repo}</strong> ({source.branch}), saved in this browser{:else}saved in this browser{/if}
      </span>
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
      {#if extendedBy.length}
        <button role="tab" type="button" aria-selected={tab === 'graph'} onclick={() => (tab = 'graph')}>
          Extended by <span class="count">{extendedBy.length}</span>
        </button>
      {/if}
      {#if GITHUB_ENABLED}
        <button role="tab" type="button" aria-selected={tab === 'github'} onclick={() => (tab = 'github')}>GitHub</button>
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

    {#if extendedBy.length}
      <div class="tab-body" role="tabpanel" hidden={tab !== 'graph'}>
        <FamilyGraph root={active} {children} {isPartial} onOpen={(path) => open(path)} />
      </div>
    {/if}

    {#if GITHUB_ENABLED}
      <div class="tab-body" role="tabpanel" hidden={tab !== 'github'}>
        <GitHubSteps
          onOpen={openFromGitHub}
          {source}
          {files}
          hasErrors={errors > 0}
          onSaved={(next) => {
            source = next;
            persist();
          }}
        />
      </div>
    {/if}
  </section>
</main>
</section>

<Footer />
