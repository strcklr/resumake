# resumake

Write your resume once in YAML; build it to **PDF**, **Word (.docx)**, **HTML** and **Markdown**.
Keep a default resume plus any number of tailored variants that inherit from it, and let CI
publish fresh builds every time you merge to `main`.

```
resumes/
├── default.yml                   # your base resume
└── tailored/
    └── backend-platform.yml      # extends default.yml, overrides a few fields
```

## Quick start

```bash
pip install -e '.[dev]'
resumake validate                 # check every file in resumes/ against the schema
resumake build                    # build everything in resumes/ into dist/
resumake build resumes/default.yml -f pdf,docx -o out/
```

Outputs are named after the file's path under `resumes/`:
`resumes/default.yml` → `dist/default.pdf`, `resumes/tailored/backend-platform.yml` →
`dist/tailored-backend-platform.pdf`, and so on. Set `layout.output_name` to override.

PDF output uses [WeasyPrint](https://weasyprint.org), which needs Pango installed
(`apt install libpango-1.0-0 libpangoft2-1.0-0` on Debian/Ubuntu, `brew install pango` on macOS).
The other formats have no system dependencies.

## Resume variants

A variant is any `.yml` file under `resumes/`. Use `extends:` to start from another resume and
change only what differs:

```yaml
extends: ../default.yml

basics:
  label: Backend & Platform Engineer   # mappings merge: only the label changes
skills:                                # lists replace the parent's list
  - name: Platform
    keywords: [Kubernetes, Terraform]
projects: null                         # null removes a section
layout:
  sections: [summary, skills, work, education]   # reorder or drop sections
```

`extends` can also be a list (merged left to right), and chains can be any depth.
Files or folders whose names start with `_` (e.g. `resumes/_shared/contact.yml`) are treated as
shared fragments: you can `extends:` them, but they aren't built on their own.

## Format

The full schema is in [`src/resumake/schema.py`](src/resumake/schema.py); see
[`resumes/default.yml`](resumes/default.yml) for a complete example.

| Key | Contents |
|---|---|
| `basics` | `name` (required), `label`, `email`, `phone`, `location`, `website`, `summary`, `profiles[]` (`network`, `username`, `url`) |
| `work[]` | `company`, `position` (required), `url`, `location`, `start`, `end`, `summary`, `highlights[]` |
| `projects[]` | `name` (required), `url`, `start`, `end`, `summary`, `highlights[]`, `keywords[]` |
| `education[]` | `institution` (required), `degree`, `area`, `score`, `location`, `start`, `end`, `highlights[]` |
| `skills[]` | `name` (required), `keywords[]` |
| `certifications[]` | `name` (required), `issuer`, `date`, `url` |
| `layout` | `sections` (order; omitted sections are hidden), `titles` (rename headings), `output_name` |

Dates can be `2021`, `2021-03` or `2021-03-15` and render as `2021` / `Mar 2021`. An entry with a
`start` and no `end` renders as "… – Present".

## CI and where outputs live

[`.github/workflows/build.yml`](.github/workflows/build.yml) runs on every pull request and on
every push to `main` that touches resumes or code. It validates, runs the tests and builds all
formats, then:

- **Pull requests**: uploads `dist/` as a workflow artifact (kept 14 days) so you can preview the
  output before merging. Find it on the run's summary page.
- **Merges to `main`**: uploads the artifact (kept 90 days) **and** publishes a GitHub Release
  tagged `resume-YYYYMMDD-<sha>` with every file attached. Releases are permanent, so you keep a
  history of every version you've sent out.

Each new release is marked *latest*, which gives you stable links that always point at the
newest build:

```
https://github.com/strcklr/resumake/releases/latest/download/default.pdf
https://github.com/strcklr/resumake/releases/latest/download/tailored-backend-platform.docx
```

## Customizing the look

- HTML and PDF share one template and stylesheet: `src/resumake/templates/resume.html.j2` and
  `style.css` (page size and margins are in the `@page` rule).
- Markdown: `src/resumake/templates/resume.md.j2`.
- Word: built in code in `src/resumake/renderers/docx.py` so the result is a normal, editable
  Word document.

To add a format, write a `render(ctx, out_path)` function and register it in
`src/resumake/renderers/__init__.py`.

## Development

```bash
pytest
```
