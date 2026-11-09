# resumake sign-in Worker

The only server-side piece of the web editor: a Cloudflare Worker that finishes GitHub sign-in.
GitHub only swaps a sign-in code for a token when the request includes the GitHub App's client
secret, and it refuses those requests from browsers, so this Worker holds the secret and makes the
call. It also revokes tokens on sign-out.

It has two endpoints, both `POST` with a JSON body and both limited to the pages in `ALLOWED_ORIGINS`:

| Endpoint | Body | Returns |
|---|---|---|
| `/token` | `{ "code": "…" }` | `{ "access_token": "…", "expires_in": 28800 }` (the refresh token is dropped) |
| `/revoke` | `{ "access_token": "…" }` | `204` |

It stores nothing and logs nothing; Cloudflare request logging is off in `wrangler.toml`.

```bash
npm install
npm test          # handler tests, with GitHub mocked
npm run check     # type-check
```

## One-time setup

### 1. Register the GitHub App

GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**:

- **Name:** `resumake` (its URL slug is used in the editor's "give it access" link)
- **Homepage URL:** `https://resumake.chasestrickler.com`
- **Callback URL:** `https://resumake.chasestrickler.com/`
  (the editor doesn't send its own address, so GitHub always returns people here). Sign-in only
  works over `https://`: once GitHub has issued the site's certificate, turn on **Enforce HTTPS**
  in the repo's Settings → Pages so `http://` visits are redirected.
- **Expire user authorization tokens:** on
- **Request user authorization (OAuth) during installation:** on (installing then also signs you in)
- **Webhook:** off (uncheck **Active**)
- **Repository permissions:** **Contents: Read and write**, **Pull requests: Read and write**
  (Metadata: Read-only is added automatically), and optionally **Actions: Read-only**, which lets
  the editor show the build's status after a save (without it, it links to the Actions tab).
  Nothing else.
- **Where can this GitHub App be installed?** Any account, so others can use the editor.

Then note the **Client ID** and **Generate a new client secret**.

### 2. Cloudflare

Create a free Cloudflare account, then:

- **Account ID:** shown on the Workers & Pages overview.
- **API token:** My Profile → API Tokens → Create Token → **Edit Cloudflare Workers** template,
  limited to your account.

### 3. resumake repo settings (Settings → Secrets and variables → Actions)

| Kind | Name | Value |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | the API token |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | the account ID |
| Secret | `GH_APP_CLIENT_SECRET` | the app's client secret |
| Variable | `RESUMAKE_GH_CLIENT_ID` | the app's client ID |
| Variable | `RESUMAKE_GH_APP_SLUG` | the app's slug, e.g. `resumake` |
| Variable | `RESUMAKE_AUTH_URL` | the Worker's URL, e.g. `https://resumake-auth.<subdomain>.workers.dev` (shown after the first deploy) |

Then run the **Sign-in Worker** workflow (Actions tab, on `main`) to deploy the Worker, set
`RESUMAKE_AUTH_URL` from its output, and run the **Web editor** workflow to rebuild the site with
sign-in turned on.

## Security notes

- People sign in on github.com; their password never reaches the site or this Worker.
- A token reaches only the repos someone installed the app on, with the two permissions above, and
  expires after 8 hours. The page keeps it in `sessionStorage` (this tab only) and revokes it on
  sign-out.
- The client secret lives only as a Worker secret and a GitHub Actions secret. If it leaks,
  regenerate it in the app's settings and update `GH_APP_CLIENT_SECRET`.
- Anyone who can change this Worker could log tokens, so protect what deploys it: 2FA on Cloudflare
  and GitHub, an API token limited to Workers, and ideally branch protection on `main`.

## Local development

Create `worker/.dev.vars` (gitignored) with `GH_CLIENT_ID`, `GH_CLIENT_SECRET` and
`ALLOWED_ORIGINS=http://localhost:5173`, run `npm run dev`, and build the editor with
`VITE_AUTH_URL=http://localhost:8787`. GitHub only redirects to the app's callback URL, so a second
app with a `http://localhost:5173/` callback is the easiest way to sign in locally.
