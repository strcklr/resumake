<script lang="ts">
  // Save the editor's changes back to the repo they were opened from: one commit with every added,
  // edited and deleted file, to a new branch (with a pull request) or an existing one. Then follow
  // the repo's build workflow for that commit.
  import { onDestroy } from 'svelte';
  import type { Source } from './lib/files';
  import type { Files } from './lib/workspace';
  import {
    diffFiles,
    GitHub,
    GitHubError,
    invalidBranch,
    SaveConflict,
    suggestBranch,
    toChanges,
    type WorkflowRun,
  } from './lib/github';

  interface Props {
    token: string;
    source: Source;
    files: Files;
    /** The open file has errors: the build will likely fail. */
    hasErrors: boolean;
    onSaved: (next: Source) => void;
  }
  let { token, source, files, hasErrors, onSaved }: Props = $props();

  const gh = $derived(new GitHub(token));
  const diff = $derived(source.base ? diffFiles(source.base, files) : null);
  const count = $derived(diff ? diff.added.length + diff.modified.length + diff.deleted.length : 0);

  // Where to save: a new branch by default; after a first save to one, keep adding to it.
  const onWorkBranch = $derived(source.branch !== source.defaultBranch);
  // The form's starting choices come from the source as it is when the form appears.
  // svelte-ignore state_referenced_locally
  let mode: 'new' | 'existing' = $state(source.branch !== source.defaultBranch ? 'existing' : 'new');
  let newBranch = $state(suggestBranch());
  // svelte-ignore state_referenced_locally
  let existingBranch = $state(source.branch);
  let branchList: string[] | null = $state(null);
  let openPr = $state(true);
  let title = $state('Update resumes');

  let saving = $state(false);
  let error: string | null = $state(null);
  let suggestNewBranch = $state(false);
  interface SaveResult {
    branch: string;
    commit: string;
    commitUrl: string;
    pr?: { number: number; url: string };
    prNote?: string;
  }
  let result = $state<SaveResult | null>(null);
  let runs: WorkflowRun[] | null | undefined = $state(undefined);
  let poll: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(poll));

  const target = $derived(mode === 'new' ? newBranch.trim() : existingBranch);
  const toDefault = $derived(mode === 'existing' && existingBranch === source.defaultBranch);
  const branchProblem = $derived(mode === 'new' ? invalidBranch(newBranch.trim()) : null);

  async function loadBranches() {
    if (branchList) return;
    try {
      branchList = await gh.branches(source.repo);
      if (!branchList.includes(existingBranch)) existingBranch = source.defaultBranch;
    } catch (e) {
      error = (e as Error).message;
    }
  }
  $effect(() => {
    if (mode === 'existing') void loadBranches();
  });

  function message(): string {
    const lines = [
      ...diff!.added.map((p) => `Add ${p}`),
      ...diff!.modified.map((p) => `Update ${p}`),
      ...diff!.deleted.map((p) => `Delete ${p}`),
    ];
    return `${title.trim() || 'Update resumes'}\n\n${lines.map((l) => `- ${l}`).join('\n')}\n\nSaved from the resumake editor.`;
  }

  async function save() {
    if (!diff || !count || branchProblem) return;
    saving = true;
    error = null;
    suggestNewBranch = false;
    result = null;
    runs = undefined;
    clearTimeout(poll);
    const snapshot = { ...files };
    const branch = target;
    try {
      const saved = await gh.commitChanges({
        repo: source.repo,
        branch,
        newBranch: mode === 'new',
        baseCommit: source.commit,
        changes: toChanges(diff, snapshot, source.folder),
        message: message(),
      });
      const done: SaveResult = { branch, commit: saved.commit, commitUrl: saved.url };
      if (openPr && !toDefault) {
        try {
          done.pr = await gh.openPullRequest(source.repo, {
            head: branch,
            base: source.defaultBranch,
            title: title.trim() || 'Update resumes',
            body: 'Saved from the [resumake editor](https://resumake.chasestrickler.com). The build workflow attaches the PDF and Word files to its run.',
          });
        } catch (e) {
          // Most often: a pull request for this branch already exists, and the new commit is on it.
          done.prNote = /already exists/i.test((e as Error).message)
            ? 'This branch already has a pull request; the commit was added to it.'
            : `The commit was saved, but the pull request wasn't opened: ${(e as Error).message}`;
        }
      }
      result = done;
      onSaved({ ...source, branch, commit: saved.commit, base: snapshot });
      mode = 'existing';
      existingBranch = branch;
      if (branchList && !branchList.includes(branch)) branchList = [...branchList, branch];
      newBranch = suggestBranch();
      void follow(saved.commit, Date.now());
    } catch (e) {
      if (e instanceof SaveConflict) {
        error = `${e.message} Nothing was saved. Save to a new branch instead, or open the repo again to get the latest.`;
        suggestNewBranch = true;
      } else if (e instanceof GitHubError && mode === 'existing' && (e.status === 422 || e.status === 403)) {
        error = `GitHub didn't accept the commit on ${branch} (${e.message}). It may be protected. Save to a new branch instead.`;
        suggestNewBranch = true;
      } else if (e instanceof GitHubError && mode === 'new' && e.status === 422) {
        error = `Couldn't create ${branch}: ${e.message} Try another name.`;
      } else {
        error = (e as Error).message;
      }
    } finally {
      saving = false;
    }
  }

  /** Follow the repo's workflow runs for the commit until they finish (or for 10 minutes). */
  async function follow(sha: string, started: number) {
    try {
      runs = await gh.workflowRuns(source.repo, sha);
    } catch {
      runs = null;
    }
    const pending = runs === undefined || (runs !== null && (!runs.length || runs.some((r) => r.status !== 'completed')));
    if (pending && Date.now() - started < 10 * 60_000) poll = setTimeout(() => follow(sha, started), 8000);
  }

  function runLabel(run: WorkflowRun): string {
    if (run.status !== 'completed') return run.status === 'queued' ? 'queued' : 'running…';
    return { success: 'passed', failure: 'failed', cancelled: 'cancelled' }[run.conclusion ?? ''] ?? run.conclusion ?? 'done';
  }
</script>

<div class="save">
  <h3>Save to GitHub</h3>
  {#if !diff}
    <p>Open the repo again (above) to save from here: these files were opened before saving was available.</p>
  {:else if !count && !result}
    <p class="muted">No changes since you opened <code>{source.branch}</code> at <code>{source.commit.slice(0, 7)}</code>.</p>
  {:else}
    {#if count}
      <ul class="changes" aria-label="Changes to save">
        {#each diff.added as p (p)}<li><span class="mark add" title="added">+</span>{p}</li>{/each}
        {#each diff.modified as p (p)}<li><span class="mark mod" title="edited">~</span>{p}</li>{/each}
        {#each diff.deleted as p (p)}<li><span class="mark del" title="deleted">−</span>{p}</li>{/each}
      </ul>

      <fieldset class="where">
        <legend>Save to</legend>
        <label class="choice">
          <input type="radio" bind:group={mode} value="new" />
          <span>A new branch</span>
        </label>
        {#if mode === 'new'}
          <input class="branch" type="text" bind:value={newBranch} aria-label="New branch name" spellcheck="false" />
          {#if branchProblem}<p class="field-error">{branchProblem}</p>{/if}
        {/if}
        <label class="choice">
          <input type="radio" bind:group={mode} value="existing" />
          <span>An existing branch{onWorkBranch ? '' : ` (e.g. ${source.defaultBranch})`}</span>
        </label>
        {#if mode === 'existing'}
          <select class="branch" bind:value={existingBranch} aria-label="Branch">
            {#each branchList ?? [existingBranch] as b (b)}
              <option value={b}>{b}{b === source.defaultBranch ? ' (default)' : ''}</option>
            {/each}
          </select>
        {/if}
      </fieldset>

      <label class="field">
        <span>{toDefault ? 'Commit message' : 'Title'}</span>
        <input type="text" bind:value={title} />
      </label>
      {#if !toDefault}
        <label class="check">
          <input type="checkbox" bind:checked={openPr} />
          <span>Open a pull request into <code>{source.defaultBranch}</code></span>
        </label>
      {/if}
      {#if toDefault}
        <p class="fine">Commits straight to <code>{source.defaultBranch}</code>: your workflow publishes a release from it.</p>
      {/if}
      {#if hasErrors}<p class="fine warn-text">The open file has problems, so the build will probably fail.</p>{/if}

      <button type="button" class="primary" onclick={save} disabled={saving || !!branchProblem}>
        {saving ? 'Saving…' : `Save ${count} change${count === 1 ? '' : 's'}`}
      </button>
    {/if}

    {#if error}
      <p class="gh-error" role="alert">{error}</p>
      {#if suggestNewBranch}
        <button type="button" onclick={() => ((mode = 'new'), (error = null), (suggestNewBranch = false))}>Use a new branch</button>
      {/if}
    {/if}

    {#if result}
      <div class="saved" aria-live="polite">
        <p>
          Saved to <code>{result.branch}</code>:
          <a href={result.commitUrl} target="_blank" rel="noopener noreferrer">commit {result.commit.slice(0, 7)} ↗</a>
          {#if result.pr}
            · <a href={result.pr.url} target="_blank" rel="noopener noreferrer">pull request #{result.pr.number} ↗</a>
          {/if}
        </p>
        {#if result.prNote}<p class="fine">{result.prNote}</p>{/if}
        {#if runs === undefined}
          <p class="fine"><span class="spinner" aria-hidden="true"></span> Looking for the build…</p>
        {:else if runs === null}
          <p class="fine">
            Follow the build in the repo's
            <a href={`https://github.com/${source.repo}/actions`} target="_blank" rel="noopener noreferrer">Actions tab ↗</a>.
          </p>
        {:else if !runs.length}
          <p class="fine"><span class="spinner" aria-hidden="true"></span> Waiting for the build to start…</p>
        {:else}
          <ul class="runs">
            {#each runs as run (run.url)}
              <li class={run.conclusion ?? run.status}>
                <a href={run.url} target="_blank" rel="noopener noreferrer">{run.name}</a>: {runLabel(run)}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .save { margin-top: 0.9rem; padding-top: 0.8rem; border-top: 1px solid var(--border); }
  .save h3 { margin: 0 0 0.4rem; font-size: 0.9rem; }
  .save p { margin: 0.4rem 0 0; font-size: 0.85rem; }
  .muted { color: var(--muted); }
  .changes { list-style: none; margin: 0.3rem 0 0.6rem; padding: 0; display: grid; gap: 0.15rem; font: 0.8rem ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .mark { display: inline-block; width: 1.1rem; font-weight: 700; }
  .add { color: var(--ok); }
  .mod { color: var(--warn); }
  .del { color: var(--bad); }
  .where { border: 0; padding: 0; margin: 0 0 0.6rem; display: grid; gap: 0.3rem; }
  .where legend { font-size: 0.75rem; color: var(--muted); margin-bottom: 0.2rem; padding: 0; }
  .choice, .check { display: flex; align-items: center; gap: 0.45rem; font-size: 0.85rem; }
  .branch, .field input {
    font: 0.85rem ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; padding: 0.4rem 0.5rem; margin-left: 1.5rem;
    border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); max-width: calc(100% - 1.5rem);
  }
  .field { display: grid; gap: 0.2rem; font-size: 0.75rem; color: var(--muted); margin-bottom: 0.4rem; }
  .field input { margin-left: 0; font-family: inherit; max-width: 100%; }
  .check { margin: 0.2rem 0 0.6rem; }
  .field-error { color: var(--bad); font-size: 0.78rem !important; margin: 0 0 0 1.5rem !important; }
  .save > button { margin-top: 0.4rem; }
  .saved { margin-top: 0.7rem; padding: 0.6rem 0.7rem; border-radius: 6px; background: var(--surface); border: 1px solid var(--border); }
  .saved p:first-child { margin-top: 0; }
  .runs { list-style: none; margin: 0.4rem 0 0; padding: 0; font-size: 0.82rem; display: grid; gap: 0.2rem; }
  .runs li::before { content: '●'; margin-right: 0.4rem; color: var(--muted); }
  .runs li.success::before { color: var(--ok); }
  .runs li.failure::before { color: var(--bad); }
  .runs li.in_progress::before, .runs li.queued::before { color: var(--warn); }
  .fine { font-size: 0.78rem !important; color: var(--muted); display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
</style>
