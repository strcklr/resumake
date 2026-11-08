import { beforeEach, describe, expect, it, vi } from 'vitest';
import { config, decodeBlob, exchangeCode, GitHub, loadSession, readCallback, signInUrl, type GitHubConfig } from './github';

// A minimal sessionStorage for Node.
const store = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});
beforeEach(() => store.clear());

const cfg: GitHubConfig = { clientId: 'Iv1.abc', appSlug: 'resumake', authUrl: 'https://auth.example.dev' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

describe('config', () => {
  it('needs all three settings', () => {
    expect(config({ VITE_GH_CLIENT_ID: 'x', VITE_GH_APP_SLUG: 'y', VITE_AUTH_URL: 'https://a.dev/' })).toEqual({
      clientId: 'x', appSlug: 'y', authUrl: 'https://a.dev',
    });
    expect(config({ VITE_GH_CLIENT_ID: 'x' })).toBeNull();
  });
});

describe('the sign-in round trip', () => {
  it('accepts the code only with the state it sent', () => {
    const url = new URL(signInUrl(cfg, 'https://resumake.chasestrickler.com/'));
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('Iv1.abc');
    const state = url.searchParams.get('state')!;
    expect(state).toMatch(/^[0-9a-f]{32}$/);
    expect(readCallback(`?code=abc&state=${state}`)).toBe('abc');
    // The state is single-use.
    expect(() => readCallback(`?code=abc&state=${state}`)).toThrow(/not started from this page/);
  });

  it('rejects a forged state', () => {
    signInUrl(cfg, 'https://x/');
    expect(() => readCallback('?code=abc&state=forged')).toThrow(/not started from this page/);
  });

  it('accepts the redirect after installing the app, which has no state', () => {
    expect(readCallback('?code=abc&installation_id=42&setup_action=install')).toBe('abc');
    expect(() => readCallback('?code=abc')).toThrow(/missing/);
  });

  it('does nothing on a normal page load', () => {
    expect(readCallback('')).toBeNull();
  });

  it('swaps the code through the Worker and keeps the token for this tab', async () => {
    const fetchImpl = vi.fn(async () => json({ access_token: 'ghu_1', expires_in: 28800 }));
    const session = await exchangeCode(cfg, 'abc', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith('https://auth.example.dev/token', expect.objectContaining({ method: 'POST' }));
    expect(session.token).toBe('ghu_1');
    expect(loadSession()?.token).toBe('ghu_1');
    expect(loadSession(Date.now() + 9 * 3600_000)).toBeNull(); // expired
  });

  it('reports the Worker’s error', async () => {
    await expect(exchangeCode(cfg, 'abc', async () => json({ error: 'The code passed is incorrect or expired.' }, 400))).rejects.toThrow(
      /incorrect or expired/,
    );
  });
});

describe('reading a repo', () => {
  const routes: Record<string, unknown> = {
    '/user/installations?per_page=100': { installations: [{ id: 7 }] },
    '/user/installations/7/repositories?per_page=100': {
      repositories: [{ full_name: 'jo/resumes', private: true, default_branch: 'main' }],
    },
    '/repos/jo/resumes/branches/main': { commit: { sha: 'c0ffee', commit: { tree: { sha: 'tree1' } } } },
    '/repos/jo/resumes/git/trees/tree1?recursive=1': {
      truncated: false,
      tree: [
        { path: 'README.md', type: 'blob', sha: 'r' },
        { path: 'resumes', type: 'tree', sha: 't' },
        { path: 'resumes/default.yml', type: 'blob', sha: 'b1' },
        { path: 'resumes/tailored/acme.yml', type: 'blob', sha: 'b2' },
        { path: '.github/workflows/build.yml', type: 'blob', sha: 'w' },
      ],
    },
    '/repos/jo/resumes/git/blobs/b1': { content: b64('basics:\n  name: Jö\n'), encoding: 'base64' },
    '/repos/jo/resumes/git/blobs/b2': { content: b64('extends: ../default.yml\n'), encoding: 'base64' },
  };
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer ghu_1');
    const path = String(url).replace('https://api.github.com', '');
    return path in routes ? json(routes[path]) : json({ message: 'Not Found' }, 404);
  });
  const gh = new GitHub('ghu_1', fetchImpl as typeof fetch);

  it('lists the repos the app can see', async () => {
    expect(await gh.repos()).toEqual([{ fullName: 'jo/resumes', private: true, defaultBranch: 'main' }]);
  });

  it('loads the resumes folder as workspace files', async () => {
    const loaded = await gh.loadResumes({ fullName: 'jo/resumes', private: true, defaultBranch: 'main' });
    expect(loaded).toEqual({
      repo: 'jo/resumes',
      branch: 'main',
      commit: 'c0ffee',
      folder: 'resumes',
      files: { 'default.yml': 'basics:\n  name: Jö\n', 'tailored/acme.yml': 'extends: ../default.yml\n' },
    });
  });

  it('explains an expired token', async () => {
    const expired = new GitHub('ghu_1', async () => json({ message: 'Bad credentials' }, 401));
    await expect(expired.user()).rejects.toThrow(/expired/);
  });

  it('decodes UTF-8 from base64 with line breaks', () => {
    expect(decodeBlob(b64('naïve ✓').replace(/(.{4})/g, '$1\n'), 'base64')).toBe('naïve ✓');
  });
});
