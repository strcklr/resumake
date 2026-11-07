# resumake web editor (proof of concept)

A browser editor for resumake YAML: syntax highlighting, field autocomplete, and validation against
resumake's own schema with errors underlined on the exact line. Drafts stay in your browser.

This is the first iteration of the web editor plan. Not built yet: the live HTML preview (resumake
running in Pyodide), the template repo button, and GitHub sign-in and saving. Their buttons are
placeholders that explain what they'll do.

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm test           # validation and autocomplete tests
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

## Layout

| File | |
|---|---|
| `src/lib/validate.ts` | Parses YAML (keeping source positions), validates with Ajv, maps each error to a line |
| `src/lib/complete.ts` | Field and section-name suggestions from the schema |
| `src/lib/editor.ts` | CodeMirror setup: YAML mode, lint, autocomplete |
| `src/App.svelte` | The page |
| `src/GitHubSteps.svelte` | Placeholder steps for the private-repo workflow |

`extends:` isn't resolved in the browser: a file that uses it is checked on its own, with a warning.
Resolving it across files arrives with GitHub sign-in.
