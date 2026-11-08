/**
 * resumake's sign-in Worker: the one piece of the web editor that runs on a server.
 *
 * GitHub only swaps a sign-in code for a token when the request carries the GitHub App's client
 * secret, and it refuses those requests from browsers. This Worker holds the secret and does the swap,
 * and revokes a token on sign-out (which also needs the secret). It stores nothing and logs nothing,
 * and only answers pages listed in ALLOWED_ORIGINS.
 */

export interface Env {
  /** The GitHub App's client ID (public). */
  GH_CLIENT_ID: string;
  /** The GitHub App's client secret (a Worker secret, never in the repo). */
  GH_CLIENT_SECRET: string;
  /** Comma-separated origins allowed to call this Worker, e.g. https://resumake.chasestrickler.com */
  ALLOWED_ORIGINS: string;
}

type Fetch = typeof fetch;

export default {
  fetch: (request: Request, env: Env) => handle(request, env, fetch),
};

export async function handle(request: Request, env: Env, fetchImpl: Fetch): Promise<Response> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return json({ error: 'This page is not allowed to use the sign-in service.' }, 403);

  const cors = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405, cors);
  if (!env.GH_CLIENT_ID || !env.GH_CLIENT_SECRET) return json({ error: 'Sign-in is not configured.' }, 500, cors);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Send a JSON body.' }, 400, cors);
  }

  switch (new URL(request.url).pathname) {
    case '/token':
      return token(body, env, fetchImpl, cors);
    case '/revoke':
      return revoke(body, env, fetchImpl, cors);
    default:
      return json({ error: 'Not found.' }, 404, cors);
  }
}

/** Swap a sign-in code for a user access token. Only the token and its lifetime go back to the page. */
async function token(body: Record<string, unknown>, env: Env, fetchImpl: Fetch, cors: HeadersInit) {
  const code = body.code;
  if (typeof code !== 'string' || !/^[\w-]{1,128}$/.test(code)) return json({ error: 'Missing or malformed code.' }, 400, cors);

  const res = await fetchImpl('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'resumake-auth' },
    body: JSON.stringify({ client_id: env.GH_CLIENT_ID, client_secret: env.GH_CLIENT_SECRET, code }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof data.access_token !== 'string') {
    const reason = typeof data.error_description === 'string' ? data.error_description : 'GitHub did not return a token.';
    return json({ error: reason }, 400, cors);
  }
  // The refresh token is deliberately dropped: the page keeps the token for this browser tab only,
  // and signs in again when it expires (8 hours).
  return json({ access_token: data.access_token, expires_in: typeof data.expires_in === 'number' ? data.expires_in : null }, 200, cors);
}

/** Revoke a user access token on sign-out. Succeeds even if the token was already gone. */
async function revoke(body: Record<string, unknown>, env: Env, fetchImpl: Fetch, cors: HeadersInit) {
  const accessToken = body.access_token;
  if (typeof accessToken !== 'string' || accessToken.length > 512) return json({ error: 'Missing token.' }, 400, cors);

  const res = await fetchImpl(`https://api.github.com/applications/${encodeURIComponent(env.GH_CLIENT_ID)}/token`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Basic ${btoa(`${env.GH_CLIENT_ID}:${env.GH_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/json',
      'User-Agent': 'resumake-auth',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ access_token: accessToken }),
  });
  if (res.status === 204 || res.status === 404) return new Response(null, { status: 204, headers: cors });
  return json({ error: 'GitHub could not revoke the token.' }, 502, cors);
}

function json(data: unknown, status: number, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
