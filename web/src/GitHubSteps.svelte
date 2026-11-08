<script lang="ts">
  // The GitHub tab: create a resumes repo from the template, sign in with the resumake GitHub App,
  // and open the repo's resumes in the editor. Saving back arrives in the next step of #5.
  import { onMount } from 'svelte';
  import {
    callbackUrl,
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
    source: { repo: string; branch: string; commit: string } | null;
  }
  let { onOpen, source }: Props = $props();

  const TEMPLATE_REPO = 'https://github.com/strcklr/resumes-template';
  const USE_TEMPLATE = 'https://github.com/new?template_name=resumes-template&template_owner=strcklr';
  const cfg = config();

  let session: Session | null = $state(cfg ? loadSession() : null);
  let login: string | null = $state(null);
  let repos: Repo[] | null = $state(null);
  let selected = $state('');
  let busy: string | null = $state(null);
  let error: string | null = $state(null);

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

  {#if session && login}
    <div class="gh-account">
      <p class="gh-signed-in">
        Signed in as <strong>@{login}</strong>
        <button type="button" class="link" onclick={doSignOut}>Sign out</button>
      </p>
      {#if repos && repos.length}
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
          browser. Missing a repo? <a href={installUrl(cfg!)} target="_blank" rel="noopener noreferrer">Give the app access to it</a>.
        </p>
      {:else if repos}
        <p>The resumake app can't see any of your repos yet.</p>
        <a class="button-link" href={installUrl(cfg!)}>Give it access to your resumes repo <span aria-hidden="true">↗</span></a>
      {/if}
      {#if source}
        <p class="gh-source">
          Editing <strong>{source.repo}</strong> on <code>{source.branch}</code> at <code>{source.commit.slice(0, 7)}</code>.
          Saving back to GitHub is coming next; until then, use <strong>Download all</strong>.
        </p>
      {/if}
    </div>
  {/if}
  {#if busy}<p class="gh-busy" aria-live="polite"><span class="spinner" aria-hidden="true"></span>{busy}</p>{/if}

  <ol class="steps">
    <li>
      <h3>Create your resumes repo</h3>
      <p>
        Makes a copy of the <a href={TEMPLATE_REPO} target="_blank" rel="noopener noreferrer">resumes template</a>: a
        sample resume, a tailored example and the build workflow.
      </p>
      <a class="button-link" href={USE_TEMPLATE} target="_blank" rel="noopener noreferrer">
        Create my resumes repo <span aria-hidden="true">↗</span>
      </a>
      <p class="fine">
        On GitHub's page, name it (for example <code>resumes</code>) and choose <strong>Private</strong>: new repos
        are public by default.
      </p>
    </li>
    <li>
      <h3>Connect GitHub</h3>
      {#if !cfg}
        <p>Sign-in isn't set up on this copy of the editor.</p>
      {:else if session && login}
        <p>Done. Pick your repo above and open its resumes.</p>
      {:else}
        <p>
          Sign in, then give the resumake GitHub App access to <em>only</em> your resumes repo. It can read and write
          that repo's files and pull requests, and nothing else. Your sign-in lasts until you close this tab, at most
          8 hours.
        </p>
        <button type="button" class="button-link" onclick={() => (window.location.href = signInUrl(cfg, callbackUrl()))}>
          Sign in with GitHub
        </button>
      {/if}
    </li>
    <li class="soon-step">
      <h3>Save changes <span class="soon">Coming soon</span></h3>
      <p>
        Commit your edits to a branch or open a pull request, and your repo's workflow builds the PDF. Until then, use
        <strong>Download all</strong> and upload the files to the repo's <code>resumes/</code> folder.
      </p>
    </li>
  </ol>
</section>
