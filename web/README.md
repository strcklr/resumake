# resumake web editor (proof of concept)

A browser editor for resumake YAML: syntax highlighting, field autocomplete, validation against
resumake's own schema with errors underlined on the exact line, and a live preview rendered by
resumake's own Python and HTML template. Drafts stay in your browser.

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
| `src/lib/complete.ts` | Field and section-name suggestions from the schema |
| `src/lib/editor.ts` | CodeMirror setup: YAML mode, lint, autocomplete |
| `src/lib/pyrender.ts` | Loads resumake into Pyodide and renders HTML (shared by the worker and tests) |
| `src/lib/preview.worker.ts`, `preview.ts` | The preview worker and the page's handle on it |
| `src/App.svelte` | The page |
| `src/Preview.svelte` | The scaled, paged preview |
| `src/Splash.svelte` | The landing screen above the editor |
| `src/GitHubSteps.svelte` | Steps for the private-repo workflow (hidden for now) |

`extends:` isn't resolved in the browser: a file that uses it is checked on its own, with a warning.
Resolving it across files arrives with GitHub sign-in.
