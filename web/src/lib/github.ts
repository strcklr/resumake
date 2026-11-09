/**
 * GitHub sign-in and reading a resumes repo, for the web editor.
 *
 * Sign-in uses the resumake GitHub App's user authorization: the browser goes to GitHub, comes back
 * with a one-time code, and the sign-in Worker (worker/) swaps it for a token, because that step
 * needs the app's client secret. The token is kept in this tab's sessionStorage only (never
 * localStorage), expires after 8 hours, and is revoked on sign-out. The app can only see the repos
 * someone installed it on, with Contents and Pull requests permissions.
 *
 * Configuration comes from the build (see web/README.md); without it, sign-in is simply unavailable.
 */
import { isThemeFile, type ThemeFiles } from './themes';
import type { Files } from './workspace';

export interface GitHubConfig {
  clientId: string;
  appSlug: string;
  /** The sign-in Worker's URL, e.g. https://resumake-auth.<account>.workers.dev */
  authUrl: string;
}

export function config(env: Record<string, string | undefined> = import.meta.env): GitHubConfig | null {
  const clientId = env.VITE_GH_CLIENT_ID;
  const appSlug = env.VITE_GH_APP_SLUG;
  const authUrl = env.VITE_AUTH_URL;
  return clientId && appSlug && authUrl ? { clientId, appSlug, authUrl: authUrl.replace(/\/$/, '') } : null;
}

const TOKEN_KEY = 'resumake:github-token';
const STATE_KEY = 'resumake:github-state';
const REPO_KEY = 'resumake:github-repo';
const API = 'https://api.github.com';

export interface Session {
  token: string;
  /** Milliseconds since the epoch, or null if GitHub didn't say. */
  expiresAt: number | null;
}

/**
 * Where to send someone to sign in. Remembers a random state to check when they come back.
 *
 * No `redirect_uri` is sent: GitHub then returns people to the callback URL registered on the app,
 * which is always right. (Sending the page's own address broke sign-in from http:// or any address
 * that differed from the registered one, even slightly.)
 */
export function signInUrl(cfg: GitHubConfig): string {
  const state = randomState();
  safe(() => sessionStorage.setItem(STATE_KEY, state));
  const params = new URLSearchParams({ client_id: cfg.clientId, state });
  return `https://github.com/login/oauth/authorize?${params}`;
}

/** Where to install the app on a repo (it also signs you in, coming back with a code). */
export function installUrl(cfg: GitHubConfig): string {
  return `https://github.com/apps/${encodeURIComponent(cfg.appSlug)}/installations/new`;
}

/**
 * If the page was opened by GitHub's redirect, the code to swap. Coming back from sign-in carries the
 * state we sent; coming back from installing the app carries an installation_id and no state.
 * Returns null when there's nothing to do, or throws if the state doesn't match (a forged link).
 */
export function readCallback(search: string): string | null {
  const params = new URLSearchParams(search);
  const code = params.get('code');
  if (!code) return null;
  const state = params.get('state');
  if (state !== null) {
    const expected = safe(() => sessionStorage.getItem(STATE_KEY));
    safe(() => sessionStorage.removeItem(STATE_KEY));
    if (!expected || expected !== state) throw new Error('This sign-in link was not started from this page. Try signing in again.');
  } else if (!params.get('installation_id')) {
    throw new Error('This sign-in link is missing its check value. Try signing in again.');
  }
  return code;
}

export async function exchangeCode(cfg: GitHubConfig, code: string, fetchImpl: typeof fetch = fetch): Promise<Session> {
  const res = await fetchImpl(`${cfg.authUrl}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number | null; error?: string };
  if (!res.ok || !data.access_token) throw new Error(data.error ?? `Sign-in failed (${res.status}).`);
  const session = { token: data.access_token, expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : null };
  saveSession(session);
  return session;
}

export function loadSession(now = Date.now()): Session | null {
  const raw = safe(() => sessionStorage.getItem(TOKEN_KEY));
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Session;
    if (session.expiresAt !== null && session.expiresAt <= now + 60_000) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function saveSession(session: Session) {
  safe(() => sessionStorage.setItem(TOKEN_KEY, JSON.stringify(session)));
}

function clearSession() {
  safe(() => sessionStorage.removeItem(TOKEN_KEY));
}

/** Sign out: forget the token here and ask the Worker to revoke it at GitHub. */
export async function signOut(cfg: GitHubConfig, session: Session, fetchImpl: typeof fetch = fetch): Promise<void> {
  clearSession();
  await fetchImpl(`${cfg.authUrl}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: session.token }),
  }).catch(() => undefined); // signed out locally either way; the token also expires on its own
}

export function rememberedRepo(): string | null {
  return safe(() => localStorage.getItem(REPO_KEY));
}

export function rememberRepo(fullName: string) {
  safe(() => localStorage.setItem(REPO_KEY, fullName));
}

// --- the GitHub API ---------------------------------------------------------------------------

export class GitHubError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface Repo {
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

export interface LoadedRepo {
  repo: string;
  /** The repo's default branch, where pull requests go. */
  defaultBranch: string;
  branch: string;
  /** The commit the files were read from; saving starts from it. */
  commit: string;
  /** The folder the files came from, e.g. `resumes`; workspace paths are relative to it. */
  folder: string;
  files: Files;
  /** The repo's own themes, from its `themes/` folder (empty if it has none). */
  themes: ThemeFiles;
}

/** The folder resumake builds from in a resumes repo. */
export const RESUMES_FOLDER = 'resumes';
/** Where a resumes repo keeps its own themes (resumake's themes.REPO_FOLDER). */
export const THEMES_FOLDER = 'themes';

export class GitHub {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  async user(): Promise<{ login: string }> {
    return this.get('/user');
  }

  /** Repos the app is installed on that this person can see. */
  async repos(): Promise<Repo[]> {
    const { installations } = await this.get<{ installations: { id: number }[] }>('/user/installations?per_page=100');
    const repos: Repo[] = [];
    for (const inst of installations) {
      const page = await this.get<{ repositories: { full_name: string; private: boolean; default_branch: string }[] }>(
        `/user/installations/${inst.id}/repositories?per_page=100`,
      );
      for (const r of page.repositories) repos.push({ fullName: r.full_name, private: r.private, defaultBranch: r.default_branch });
    }
    return repos.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  /** Read every .yml/.yaml under `resumes/` on a branch, and the repo's own themes under `themes/`. */
  async loadResumes(repo: Repo, branch = repo.defaultBranch): Promise<LoadedRepo> {
    const head = await this.get<{ commit: { sha: string; commit: { tree: { sha: string } } } }>(
      `/repos/${repo.fullName}/branches/${encodeURIComponent(branch)}`,
    );
    const tree = await this.get<{ tree: { path: string; type: string; sha: string }[]; truncated: boolean }>(
      `/repos/${repo.fullName}/git/trees/${head.commit.commit.tree.sha}?recursive=1`,
    );
    const prefix = `${RESUMES_FOLDER}/`;
    const wanted = tree.tree.filter((e) => e.type === 'blob' && e.path.startsWith(prefix) && /\.ya?ml$/i.test(e.path));
    if (!wanted.length) {
      throw new GitHubError(`${repo.fullName} has no .yml files in a ${RESUMES_FOLDER}/ folder on ${branch}.`, 404);
    }
    const themePrefix = `${THEMES_FOLDER}/`;
    const themeEntries = tree.tree.filter(
      (e) => e.type === 'blob' && e.path.startsWith(themePrefix) && isThemeFile(e.path.slice(themePrefix.length)),
    );
    const files: Files = {};
    const themes: ThemeFiles = {};
    const blob = (sha: string) => this.get<{ content: string; encoding: string }>(`/repos/${repo.fullName}/git/blobs/${sha}`);
    await Promise.all([
      ...wanted.map(async (entry) => {
        const b = await blob(entry.sha);
        files[entry.path.slice(prefix.length)] = decodeBlob(b.content, b.encoding);
      }),
      ...themeEntries.map(async (entry) => {
        const b = await blob(entry.sha);
        const rel = entry.path.slice(themePrefix.length);
        themes[rel] = rel.endsWith('.woff2')
          ? `data:font/woff2;base64,${b.encoding === 'base64' ? b.content.replace(/\s/g, '') : btoa(b.content)}`
          : decodeBlob(b.content, b.encoding);
      }),
    ]);
    return {
      repo: repo.fullName,
      defaultBranch: repo.defaultBranch,
      branch,
      commit: head.commit.sha,
      folder: RESUMES_FOLDER,
      files,
      themes,
    };
  }

  /** Branch names in a repo (the first 100). */
  async branches(repo: string): Promise<string[]> {
    const list = await this.get<{ name: string }[]>(`/repos/${repo}/branches?per_page=100`);
    return list.map((b) => b.name);
  }

  /**
   * Commit `changes` (repo paths; null content deletes) in one commit and move `branch` to it.
   *
   * - A new branch starts from `baseCommit`, the commit the files were opened from.
   * - An existing branch gets the commit on top of its current head. If any changed file was also
   *   changed on GitHub since `baseCommit`, nothing is saved (`SaveConflict`), so nobody's work is
   *   overwritten. A rejected update (e.g. a protected branch) raises `GitHubError`.
   */
  async commitChanges(opts: {
    repo: string;
    branch: string;
    newBranch: boolean;
    baseCommit: string;
    changes: Change[];
    message: string;
  }): Promise<{ commit: string; url: string }> {
    const { repo, branch, newBranch, baseCommit, changes, message } = opts;
    if (!changes.length) throw new GitHubError('There are no changes to save.', 400);
    const ref = `heads/${branch}`;
    const parent = newBranch ? baseCommit : (await this.get<{ object: { sha: string } }>(`/repos/${repo}/git/ref/${encodeRef(ref)}`)).object.sha;

    const parentTree = (await this.get<{ tree: { sha: string } }>(`/repos/${repo}/git/commits/${parent}`)).tree.sha;
    if (parent !== baseCommit) {
      const baseTree = (await this.get<{ tree: { sha: string } }>(`/repos/${repo}/git/commits/${baseCommit}`)).tree.sha;
      const [now, then] = await Promise.all([this.blobShas(repo, parentTree), this.blobShas(repo, baseTree)]);
      const conflicts = changes.map((c) => c.path).filter((path) => now.get(path) !== then.get(path));
      if (conflicts.length) throw new SaveConflict(branch, conflicts);
    }

    const tree = await this.send<{ sha: string }>('POST', `/repos/${repo}/git/trees`, {
      base_tree: parentTree,
      tree: changes.map((c) =>
        c.content === null
          ? { path: c.path, mode: '100644', type: 'blob', sha: null }
          : { path: c.path, mode: '100644', type: 'blob', content: c.content },
      ),
    });
    const commit = await this.send<{ sha: string; html_url: string }>('POST', `/repos/${repo}/git/commits`, {
      message,
      tree: tree.sha,
      parents: [parent],
    });
    if (newBranch) await this.send('POST', `/repos/${repo}/git/refs`, { ref: `refs/${ref}`, sha: commit.sha });
    else await this.send('PATCH', `/repos/${repo}/git/refs/${encodeRef(ref)}`, { sha: commit.sha, force: false });
    return { commit: commit.sha, url: commit.html_url };
  }

  async openPullRequest(repo: string, opts: { head: string; base: string; title: string; body: string }): Promise<{ number: number; url: string }> {
    const pr = await this.send<{ number: number; html_url: string }>('POST', `/repos/${repo}/pulls`, opts);
    return { number: pr.number, url: pr.html_url };
  }

  /**
   * The workflow runs for a commit (needs the app's Actions: read permission). Returns null when the
   * app can't see Actions, so the page can link to the Actions tab instead.
   */
  async workflowRuns(repo: string, sha: string): Promise<WorkflowRun[] | null> {
    try {
      const data = await this.get<{ workflow_runs: { name: string; status: string; conclusion: string | null; html_url: string }[] }>(
        `/repos/${repo}/actions/runs?head_sha=${sha}&per_page=10`,
      );
      return data.workflow_runs.map((r) => ({ name: r.name, status: r.status, conclusion: r.conclusion, url: r.html_url }));
    } catch (e) {
      if (e instanceof GitHubError && (e.status === 403 || e.status === 404)) return null;
      throw e;
    }
  }

  private async blobShas(repo: string, treeSha: string): Promise<Map<string, string>> {
    const tree = await this.get<{ tree: { path: string; type: string; sha: string }[] }>(`/repos/${repo}/git/trees/${treeSha}?recursive=1`);
    return new Map(tree.tree.filter((e) => e.type === 'blob').map((e) => [e.path, e.sha]));
  }

  private get<T>(path: string): Promise<T> {
    return this.send<T>('GET', path);
  }

  private async send<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${API}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      const reason = res.status === 401 ? 'Your GitHub sign-in has expired. Sign in again.' : data.message ?? `GitHub returned ${res.status}.`;
      throw new GitHubError(reason, res.status);
    }
    return (res.status === 204 ? undefined : res.json()) as Promise<T>;
  }
}

/** A file to write (or, with null content, delete), by its path in the repo. */
export interface Change {
  path: string;
  content: string | null;
}

export interface WorkflowRun {
  name: string;
  /** queued, in_progress, completed, ... */
  status: string;
  /** success, failure, cancelled, ... once completed */
  conclusion: string | null;
  url: string;
}

/** Files changed on GitHub since they were opened: saving would overwrite someone else's work. */
export class SaveConflict extends Error {
  constructor(readonly branch: string, readonly paths: string[]) {
    super(`${paths.join(', ')} changed on ${branch} since you opened ${paths.length === 1 ? 'it' : 'them'}.`);
  }
}

export interface FileChanges {
  added: string[];
  modified: string[];
  deleted: string[];
}

/** What differs between the files as opened (`base`) and now. Paths are workspace paths. */
export function diffFiles(base: Files, current: Files): FileChanges {
  const added = Object.keys(current).filter((p) => !(p in base)).sort();
  const modified = Object.keys(current).filter((p) => p in base && base[p] !== current[p]).sort();
  const deleted = Object.keys(base).filter((p) => !(p in current)).sort();
  return { added, modified, deleted };
}

/** The commit's changes, as repo paths under `folder`. */
export function toChanges(diff: FileChanges, current: Files, folder: string): Change[] {
  const at = (p: string) => (folder ? `${folder}/${p}` : p);
  return [
    ...[...diff.added, ...diff.modified].map((p) => ({ path: at(p), content: current[p] })),
    ...diff.deleted.map((p) => ({ path: at(p), content: null })),
  ];
}

/** Why a branch name can't be used, or null. Mirrors the parts of git's rules people hit. */
export function invalidBranch(name: string): string | null {
  if (!name.trim()) return 'Enter a branch name.';
  if (!/^[A-Za-z0-9._\/-]+$/.test(name)) return 'Use letters, numbers, and . _ / - only.';
  if (name.startsWith('/') || name.endsWith('/') || name.endsWith('.') || name.endsWith('.lock') || name.includes('..') || name.includes('//')) {
    return "That isn't a valid branch name.";
  }
  return null;
}

/** A suggested new branch name, e.g. resumake/2026-11-08-1432. */
export function suggestBranch(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `resumake/${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function encodeRef(ref: string): string {
  return ref.split('/').map(encodeURIComponent).join('/');
}

export function decodeBlob(content: string, encoding: string): string {
  if (encoding !== 'base64') return content;
  const bytes = Uint8Array.from(atob(content.replace(/\n/g, '')), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}
