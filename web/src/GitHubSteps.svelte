<script lang="ts">
  // The GitHub tab: create a resumes repo from the template, sign in with the resumake GitHub App,
  // open the repo's resumes in the editor, and save changes back (SaveToGitHub).
  import { onMount } from 'svelte';
  import SaveToGitHub from './SaveToGitHub.svelte';
  import type { Source } from './lib/files';
  import type { Files } from './lib/workspace';
  import {
    config,
    exchangeCode,
    GitHub,
    installUrl,
    loadSession,
    readCallback,
    rememberedRepo,
    rememberRepo,
    signInUrl,
    signOut,
    type LoadedRepo,
    type Repo,
    type Session,
  } from './lib/github';

  interface Props {
    /** Put a repo's files in the editor. Returns false if the person cancelled. */
    onOpen: (loaded: LoadedRepo) => boolean;
    /** Where the editor's files came from, if a repo. */
    source: Source | null;
    files: Files;
    hasErrors: boolean;
    onSaved: (next: Source) => void;
  }
  let { onOpen, source, files, hasErrors, onSaved }: Props = $props();

  const TEMPLATE_REPO = 'https://github.com/strcklr/resumes-template';
  const USE_TEMPLATE = 'https://github.com/new?template_name=resumes-template&template_owner=strcklr';
  const cfg = config();

  let session: Session | null = $state(cfg ? loadSession() : null);
  let login = $state<string | null>(null);
  let repos = $state<Repo[] | null>(null);
  let selected = $state('');
  let busy: string | null = $state(null);
  let error: string | null = $state(null);
  const signedIn = $derived(!!session && !!login);
  /** The app can see at least one repo: a resumes repo exists and is linked. */
  const linked = $derived(signedIn && !!repos?.length);

  onMount(() => {
    if (!cfg) return;
    let code: string | null = null;
    try {
      code = readCallback(window.location.search);
    } catch (e) {
      error = (e as Error).message;
    }
    if (window.location.search) {
      // Drop ?code=… from the address bar so it isn't bookmarked or reused.
      history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
    }
    if (code) void finishSignIn(code);
    else if (session) void loadAccount();
  });

  async function finishSignIn(code: string) {
    busy = 'Signing in…';
    error = null;
    try {
      session = await exchangeCode(cfg!, code);
      await loadAccount();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = null;
    }
  }

  async function loadAccount() {
    if (!session) return;
    busy = 'Loading your repos…';
    try {
      const gh = new GitHub(session.token);
      const [user, found] = await Promise.all([gh.user(), gh.repos()]);
      login = user.login;
      repos = found;
      const remembered = rememberedRepo();
      selected = found.find((r) => r.fullName === remembered)?.fullName ?? found[0]?.fullName ?? '';
    } catch (e) {
      error = (e as Error).message;
      if ((e as { status?: number }).status === 401) session = null;
    } finally {
      busy = null;
    }
  }

  async function openRepo() {
    const repo = repos?.find((r) => r.fullName === selected);
    if (!repo || !session) return;
    busy = `Opening ${repo.fullName}…`;
    error = null;
    try {
      const loaded = await new GitHub(session.token).loadResumes(repo);
      rememberRepo(repo.fullName);
      onOpen(loaded);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = null;
    }
  }

  async function doSignOut() {
    if (session && cfg) await signOut(cfg, session);
    session = null;
    login = null;
    repos = null;
  }
</script>

<section class="github">
  <h2>Keep your resumes in your own private GitHub repo</h2>
  <p>
    Your resumes live in a private repo you own. Its GitHub Actions workflow builds the PDF and Word file on every
    change, and keeps every version you've sent as a release. Nothing about your resume is stored on this site.
  </p>

  {#if error}<p class="gh-error" role="alert">{error}</p>{/if}
  {#if busy}<p class="gh-busy" aria-live="polite"><span class="spinner" aria-hidden="true"></span>{busy}</p>{/if}

  <ol class="steps">
    <li class:done={signedIn}>
      <h3>Connect your GitHub account {#if signedIn}<span class="done-tag" aria-label="done">✓</span>{/if}</h3>
      {#if !cfg}
        <p>Sign-in isn't set up on this copy of the editor.</p>
      {:else if signedIn}
        <p class="gh-signed-in">
          Signed in as <strong>@{login}</strong>
          <button type="button" class="link" onclick={doSignOut}>Sign out</button>
        </p>
      {:else}
        <p>
          Your sign-in lasts until you close this tab, at most 8 hours, and only reaches the repos you give the
          resumake app access to.
        </p>
        <button type="button" class="button-link" onclick={() => (window.location.href = signInUrl(cfg))}>
          Sign in with GitHub
        </button>
      {/if}
    </li>

    <li class:done={linked}>
      <h3>Create your resumes repo {#if linked}<span class="done-tag" aria-label="done">✓</span>{/if}</h3>
      <p>
        {#if linked}You have one. To start another,{:else}Already have one? Skip to step 3. Otherwise,{/if}
        make a copy of the <a href={TEMPLATE_REPO} target="_blank" rel="noopener noreferrer">resumes template</a>: a
        sample resume, a tailored example and the build workflow.
      </p>
      <a class="button-link" class:secondary={linked} href={USE_TEMPLATE} target="_blank" rel="noopener noreferrer">
        Create my resumes repo <span aria-hidden="true">↗</span>
      </a>
      <p class="fine">Choose <strong>Private</strong> on GitHub's page: new repos are public by default.</p>
    </li>

    <li class:done={!!source}>
      <h3>Link it {#if source}<span class="done-tag" aria-label="done">✓</span>{/if}</h3>
      {#if signedIn && repos && repos.length}
        <div class="gh-open">
          <label>
            <span>Repo</span>
            <select bind:value={selected}>
              {#each repos as repo (repo.fullName)}
                <option value={repo.fullName}>{repo.fullName}{repo.private ? '' : ' (public)'}</option>
              {/each}
            </select>
          </label>
          <button type="button" class="primary" onclick={openRepo} disabled={!!busy}>Open its resumes</button>
        </div>
        {#if repos.find((r) => r.fullName === selected && !r.private)}
          <p class="fine warn-text">This repo is public: anyone can read the resumes in it.</p>
        {/if}
        <p class="fine">
          Opens every <code>.yml</code> file in the repo's <code>resumes/</code> folder, replacing the files in this
          browser. Not listed? <a href={installUrl(cfg!)}>Link another repo</a>.
        </p>
        {#if source}
          <p class="gh-source">
            Editing <strong>{source.repo}</strong> on <code>{source.branch}</code> at <code>{source.commit.slice(0, 7)}</code>.
          </p>
        {/if}
      {:else}
        <p>
          Give the resumake app access to <em>only</em> your resumes repo, so the editor can open it and save to it. The
          app can read and write that repo's files and pull requests, and nothing else.
        </p>
        {#if cfg}
          <a class="button-link" href={installUrl(cfg)}>Link my resumes repo</a>
        {/if}
      {/if}
    </li>

    <li>
      <h3>Save changes</h3>
      {#if signedIn && source && session}
        <SaveToGitHub token={session.token} {source} {files} {hasErrors} {onSaved} />
      {:else}
        <p>
          Once your repo's resumes are open here, <strong>Save to GitHub</strong> commits your edits to a new branch with
          a pull request, or to an existing branch, and your repo's workflow builds the PDF and Word file.
        </p>
      {/if}
    </li>
  </ol>
</section>
