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

/** The page's own URL without query or hash: where GitHub sends people back. */
export function callbackUrl(location: Location = window.location): string {
  return `${location.origin}${location.pathname}`;
}

/** Where to send someone to sign in. Remembers a random state to check when they come back. */
export function signInUrl(cfg: GitHubConfig, redirectUri: string): string {
  const state = randomState();
  safe(() => sessionStorage.setItem(STATE_KEY, state));
  const params = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: redirectUri, state });
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
  branch: string;
  /** The commit the files were read from (saving in #5 starts from it). */
  commit: string;
  /** The folder the files came from, e.g. `resumes`; workspace paths are relative to it. */
  folder: string;
  files: Files;
}

/** The folder resumake builds from in a resumes repo. */
export const RESUMES_FOLDER = 'resumes';

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

  /** Read every .yml/.yaml under `resumes/` on a branch. */
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
    const files: Files = {};
    await Promise.all(
      wanted.map(async (entry) => {
        const blob = await this.get<{ content: string; encoding: string }>(`/repos/${repo.fullName}/git/blobs/${entry.sha}`);
        files[entry.path.slice(prefix.length)] = decodeBlob(blob.content, blob.encoding);
      }),
    );
    return { repo: repo.fullName, branch, commit: head.commit.sha, folder: RESUMES_FOLDER, files };
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(`${API}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      const reason = res.status === 401 ? 'Your GitHub sign-in has expired. Sign in again.' : data.message ?? `GitHub returned ${res.status}.`;
      throw new GitHubError(reason, res.status);
    }
    return res.json() as Promise<T>;
  }
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
