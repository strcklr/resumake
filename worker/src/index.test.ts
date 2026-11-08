import { describe, expect, it, vi } from 'vitest';
import { handle, type Env } from './index';

const env: Env = { GH_CLIENT_ID: 'Iv1.client', GH_CLIENT_SECRET: 'shh', ALLOWED_ORIGINS: 'https://resumake.chasestrickler.com, http://localhost:5173' };
const SITE = 'https://resumake.chasestrickler.com';

function req(path: string, init: { method?: string; origin?: string; body?: unknown } = {}) {
  return new Request(`https://resumake-auth.example.workers.dev${path}`, {
    method: init.method ?? 'POST',
    headers: { Origin: init.origin ?? SITE, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

const reply = (status: number, body?: unknown) =>
  vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));

describe('origins', () => {
  it('refuses pages that are not allowed', async () => {
    const fetchImpl = reply(200, {});
    const res = await handle(req('/token', { origin: 'https://evil.example', body: { code: 'abc' } }), env, fetchImpl);
    expect(res.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('answers preflight requests from allowed pages', async () => {
    const res = await handle(req('/token', { method: 'OPTIONS', origin: 'http://localhost:5173' }), env, reply(200));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  });
});

describe('/token', () => {
  it('swaps a code for a token and returns only the token and its lifetime', async () => {
    const fetchImpl = reply(200, { access_token: 'ghu_abc', expires_in: 28800, refresh_token: 'ghr_secret', token_type: 'bearer' });
    const res = await handle(req('/token', { body: { code: 'code-123' } }), env, fetchImpl);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ access_token: 'ghu_abc', expires_in: 28800 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://github.com/login/oauth/access_token');
    expect(JSON.parse(init.body as string)).toEqual({ client_id: 'Iv1.client', client_secret: 'shh', code: 'code-123' });
  });

  it('passes on GitHub’s reason when the code is bad', async () => {
    const res = await handle(req('/token', { body: { code: 'used' } }), env, reply(200, { error: 'bad_verification_code', error_description: 'The code passed is incorrect or expired.' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'The code passed is incorrect or expired.' });
  });

  it('rejects malformed codes without calling GitHub', async () => {
    const fetchImpl = reply(200, {});
    expect((await handle(req('/token', { body: { code: 'a b' } }), env, fetchImpl)).status).toBe(400);
    expect((await handle(req('/token', { body: {} }), env, fetchImpl)).status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('/revoke', () => {
  it('revokes with the app’s credentials', async () => {
    const fetchImpl = reply(204);
    const res = await handle(req('/revoke', { body: { access_token: 'ghu_abc' } }), env, fetchImpl);
    expect(res.status).toBe(204);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.github.com/applications/Iv1.client/token');
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa('Iv1.client:shh')}`);
  });

  it('treats an already-gone token as revoked', async () => {
    expect((await handle(req('/revoke', { body: { access_token: 'ghu_old' } }), env, reply(404))).status).toBe(204);
  });
});

describe('everything else', () => {
  it('rejects other paths and methods', async () => {
    expect((await handle(req('/other', { body: {} }), env, reply(200))).status).toBe(404);
    expect((await handle(req('/token', { method: 'GET' }), env, reply(200))).status).toBe(405);
  });

  it('says so when the secret is missing', async () => {
    const res = await handle(req('/token', { body: { code: 'abc' } }), { ...env, GH_CLIENT_SECRET: '' }, reply(200));
    expect(res.status).toBe(500);
  });
});
