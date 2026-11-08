# resumake web editor

**Live at https://resumake.chasestrickler.com**

A browser editor for resumake YAML: syntax highlighting, field autocomplete, validation against
resumake's own schema with errors underlined on the exact line, and a live preview rendered by
resumake's own Python and HTML template. Tailored resumes that `extends:` a base work across files.
Your files stay in your browser.

The page opens on a splash screen (`src/Splash.svelte`) whose button scrolls down to the editor.

This is the first iteration of the web editor plan. Not built yet: the template repo button, and
GitHub sign-in and saving. Their screen (`src/GitHubSteps.svelte`) is written but hidden: set
`GITHUB_ENABLED` in `src/App.svelte` once saving is hooked up.

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm test           # validation, autocomplete and Pyodide rendering tests
npm run check      # type-check
npm run build      # static site in web/dist/
```

## GitHub sign-in

The **GitHub** tab signs in with the resumake GitHub App and opens a repo's `resumes/` folder in the
editor (saving back is the next step of #5). It needs three build settings, which CI takes from the
repo's Actions variables; without them the tab says sign-in isn't set up:

| Build variable | Actions variable | |
|---|---|---|
| `VITE_GH_CLIENT_ID` | `RESUMAKE_GH_CLIENT_ID` | The app's client ID |
| `VITE_GH_APP_SLUG` | `RESUMAKE_GH_APP_SLUG` | The app's URL slug |
| `VITE_AUTH_URL` | `RESUMAKE_AUTH_URL` | The sign-in Worker's URL |

Signing in goes to GitHub and back with a one-time code, which the sign-in Worker (`worker/`) swaps
for a token. The token stays in this tab's `sessionStorage` (never `localStorage`), expires after 8
hours, and is revoked on sign-out. The app sees only the repos it's installed on. Setup steps and
security notes are in [`worker/README.md`](../worker/README.md); the client lives in
`src/lib/github.ts`.

**Content Security Policy.** The built page carries a strict CSP (added in `vite.config.ts`): it
runs only its own scripts, and connects only to itself, `api.github.com` and the Worker. For that,
the schema validator is compiled at build time instead of with `new Function` in the browser.

## Deploying

`.github/workflows/web.yml` deploys `web/dist/` to GitHub Pages on every push to `main` that touches
the site, after the type-check, tests and build pass. To redeploy by hand, run the workflow from the
Actions tab on `main`.

The site is live at **https://resumake.chasestrickler.com**. `strcklr.github.io/resumake` redirects there.

How it's set up (one time):

- **Settings → Pages → Source** is **GitHub Actions**.
- **Settings → Pages → Custom domain** is `resumake.chasestrickler.com`, with **Enforce HTTPS** on. A
  deploy from Actions has no `CNAME` file, so the domain lives only in this setting.
- **DNS (GoDaddy):** a `CNAME` record from `resumake` to `strcklr.github.io`.

Removing either the DNS record or the Pages setting takes the subdomain offline. The build uses
relative paths (`base: './'`), so it works at a domain's root or in a subfolder.

## How validation stays in step with the CLI

`src/lib/schema.json` is generated from `src/resumake/schema.py`. After changing the schema, run:

```bash
resumake schema -o web/src/lib/schema.json
```

A Python test (`test_web_schema_is_in_sync`) fails if you forget.

The sample resume is imported straight from `resumes/default.yml`, so the site always starts from the
same sample as the CLI.

## Live preview

Each valid edit is sent to a Web Worker running [Pyodide](https://pyodide.org) (Python compiled to
WebAssembly). It calls resumake's `build_context` and HTML renderer, the same code and template the
CLI uses for HTML and PDF, and the result goes into a sandboxed iframe with scripts off. While the YAML
has errors, the last valid version stays on screen, dimmed.

- **Only the HTML path is loaded:** `context.py`, `renderers/html.py`, `renderers/_templates.py` and the
  templates, imported straight from `src/resumake/`. The real `renderers/__init__.py` imports the PDF and
  Word renderers, so a one-line stand-in replaces it. YAML is parsed and validated in JavaScript first,
  so Python needs only Jinja2 and MarkupSafe.
- **Self-hosted, no CDN:** Pyodide's runtime is copied from the `pyodide` npm package into `pyodide/`
  (see `vite.config.ts`), and Jinja2 and MarkupSafe load from `public/py/`. Rebuild those wheels with
  `scripts/build-wheels.sh`. The first visit downloads about 12 MB (3.6 MB of it gzipped wasm); after
  that the browser cache serves it.
- **Page breaks:** dashed lines mark where each printed Letter page should start, from the stylesheet's
  0.75in margins. They're an estimate, but on a 3-page test resume they matched WeasyPrint's breaks.
- **Fonts:** the bundled Gelasio fonts are inlined as data URLs so the preview looks like the PDF on
  machines without Georgia.
- **Print / Save PDF** opens the rendered HTML in a new tab with the print dialog, for a quick PDF
  without GitHub. **Download HTML** saves the same file `resumake build -f html` would write (with the
  fonts inlined).

## Layout

| File | |
|---|---|
| `src/lib/validate.ts` | Parses YAML (keeping source positions), validates with Ajv, maps each error to a line |
| `src/lib/workspace.ts` | Several files at once: resolves `extends:`, validates, maps problems to files, lists inherited fields |
| `src/lib/files.ts` | The browser's file store: saving, opening a folder, zipping, naming new files |
| `src/lib/complete.ts` | Field and section-name suggestions from the schema |
| `src/lib/editor.ts` | CodeMirror setup: YAML mode, lint, autocomplete |
| `src/lib/pyrender.ts` | Loads resumake into Pyodide and renders HTML (shared by the worker and tests) |
| `src/lib/preview.worker.ts`, `preview.ts` | The preview worker and the page's handle on it |
| `src/App.svelte` | The page |
| `src/Preview.svelte` | The scaled, paged preview |
| `src/Splash.svelte` | The landing screen above the editor |
| `src/GitHubSteps.svelte` | Steps for the private-repo workflow (hidden for now) |

## Tailored resumes (`extends:`)

The editor holds several files, so a base resume and tailored variants that `extends:` it work
together, as they do with the CLI:

- **Files:** tabs above the editor, with **+** for a new tailored file (it starts with `extends:`
  pointing at `default.yml`), and Rename, Delete and "Download this file" below. **×** (or a
  middle-click) closes a tab but keeps the file, so variants that extend it still resolve; reopen it
  from the **Files** list, which shows every file. Opening a problem or inherited field in a closed
  file reopens its tab. **Open folder** loads
  a whole `resumes/` folder; **Download all** saves every file as a `.zip` with its folders. Files are
  kept in this browser (`localStorage`) until GitHub sync (#5) replaces that.
- **Checking:** each file is checked with its `extends:` chain resolved. Problems are listed for every
  file in the chain and point to where the fix goes: a bad value to the file that set it, an unknown
  field to the file that wrote it, a missing or circular `extends:` to that line. Clicking one opens
  that file. Tabs with errors get a red dot.
- **Preview:** the merged resume, as `resumake build` would make it. Shared fragments (a path part
  starting with `_`) aren't built on their own, so they have no preview.
- **Inherited:** for a file that extends others, this tab lists the fields that come from them; click
  one to jump to where it's written.
- **Extended by:** for a file that others extend (e.g. `default.yml`), this tab draws the tree of files
  that inherit from it, directly or through another file. Click one to open it. It counts every file
  in the workspace, including ones whose tabs are closed.

The engine is `src/lib/workspace.ts`. Its merge is a port of `deep_merge` in
`src/resumake/loader.py`, and both are tested against the shared cases in `tests/fixtures/extends/`,
so a change to the merge rules has to be made in both.
