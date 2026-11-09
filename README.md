# resumake

Write your resume once in YAML; build it to **PDF**, **Word (.docx)**, **HTML** and **Markdown**.
Keep a default resume plus any number of tailored variants that inherit from it, and let CI
publish fresh builds every time you merge to `main`.

```
resumes/
├── default.yml                   # your base resume
└── tailored/
    └── example-platform.yml      # extends default.yml, overrides a few fields
```

## Quick start

```bash
pip install -e '.[dev]'
resumake validate                 # check every file in resumes/ against the schema
resumake build                    # build everything in resumes/ into dist/
resumake build resumes/default.yml -f pdf,docx -o out/
```

Outputs are named after the file's path under `resumes/`:
`resumes/default.yml` → `dist/default.pdf`, `resumes/tailored/example-platform.yml` →
`dist/tailored-example-platform.pdf`, and so on. Set `layout.output_name` to override.

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

### Recording the job a variant targets

Add a `job:` block to keep the posting with the resume you sent. It's checked against the schema
but **never rendered** in any output format:

```yaml
job:
  title: Staff Software Engineer, Platform
  company: Example Co
  url: https://example.com/careers/12345
  applied: 2026-11-04
  status: applied          # free text: applied, interviewing, rejected, offer...
  notes: Referred by a former teammate.
  description: |           # paste the posting: links stop working once a role is filled
    ...
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
| `work[]` | `company`, `position` (required), `url`, `location`, `start`, `end`, `summary`, `highlights[]`, `keywords[]` |
| `projects[]` | `name` (required), `url`, `start`, `end`, `summary`, `highlights[]`, `keywords[]` |
| `education[]` | `institution` (required), `degree`, `area`, `score`, `location`, `start`, `end`, `highlights[]` |
| `skills[]` | `name` (required), `keywords[]` |
| `certifications[]` | `name` (required), `issuer`, `date`, `url` |
| `job` | Not rendered. `title`, `company`, `url`, `applied`, `status`, `notes`, `description` |
| `layout` | `sections` (order; omitted sections are hidden), `titles` (rename headings), `output_name`, `theme` (how it looks; see below), `accent` (`#rrggbb`, for themes with colour) |

Dates can be `2021`, `2021-03` or `2021-03-15` and render as `2021` / `Mar 2021`. An entry with a
`start` and no `end` renders as "… – Present".

`keywords[]` on a `work[]` entry or on one of its `roles[]` lists the tech used there. It isn't
rendered in any format; it's there for other tools that read the same file, such as a portfolio
site that shows tags per role.

## Keeping your real resumes private

This repo holds the tool and fictional sample resumes. Keep your own resumes in a separate
**private** repository that uses resumake's reusable workflow. Tool improvements reach it
automatically, and nothing personal ever lands here.

1. Open [strcklr/resumes-template](https://github.com/strcklr/resumes-template), choose
   **Use this template → Create a new repository**, and set it to **Private**. The editor's GitHub tab
   has a button for this.
2. Replace the sample in `resumes/default.yml` with your resume, and add one file per application in
   `resumes/tailored/` (copy `_example.yml`).

resumake's CI checks that the template repo's sample resumes still validate and build with every
change here, so a schema change can't break new users' repos unnoticed.

The template's workflow is just:

```yaml
jobs:
  build:
    uses: strcklr/resumake/.github/workflows/build-resumes.yml@main
    permissions:
      contents: write
    with:
      publish-release: ${{ github.event_name != 'pull_request' && github.ref == 'refs/heads/main' }}
```

Swap `@main` for a tag or commit SHA if you'd rather take tool updates on your own schedule.
Releases in a private repo are private too: downloading them requires being signed in with access.

## CI and where outputs live

[`.github/workflows/build-resumes.yml`](.github/workflows/build-resumes.yml) is a reusable
workflow. It validates and builds every resume in the calling repo, then:

- **Pull requests**: uploads `dist/` as a workflow artifact (kept 14 days) so you can preview the
  output before merging. Find it on the run's summary page.
- **Merges to `main`** (when `publish-release` is on): uploads the artifact (kept 90 days) **and**
  publishes a GitHub Release tagged `resume-YYYYMMDD-<sha>` with every file attached. Releases
  are permanent, so you keep a history of every version you've sent out. Each one is marked
  *latest*, so `https://github.com/<owner>/<repo>/releases/latest/download/default.pdf` always
  points at the newest build.

In this repo, [`.github/workflows/build.yml`](.github/workflows/build.yml) calls the same
workflow with the tests turned on and releases turned off.

| Input | Default | |
|---|---|---|
| `resumes` | `resumes` | Directory or file to build |
| `publish-release` | `false` | Publish a GitHub Release |
| `install` | `git+https://github.com/strcklr/resumake@main` | pip requirement for resumake |
| `python-version` | `3.12` | |

## Themes

A theme sets how a resume looks; every theme shows the same content. Pick one in the YAML:

```yaml
layout:
  theme: modern        # classic (default), modern or compact
  accent: "#4338ca"    # for themes with colour; others ignore it
```

| Theme | Look |
|---|---|
| `classic` | Georgia serif, centred header, uppercase headings over a rule. The default. |
| `modern` | Inter, left-aligned header, one accent colour (default `#0f766e`). |
| `compact` | Source Sans 3, black and white, dense, section names in a left gutter. Fits more on a page. |

Like any field, `theme` and `accent` inherit through `extends:`, so a tailored resume can use a
different theme from its base. `resumake build --theme compact` overrides the file for one build,
and `resumake themes` lists the themes.

## Customizing the look

Each theme is a folder in `src/resumake/themes/`:

- `style.css`: the stylesheet for HTML and PDF (page size and margins are in its `@page` rule). The
  HTML comes from the shared `src/resumake/templates/resume.html.j2`, unless the theme has its own
  `resume.html.j2`.
- `fonts/`: bundled, openly licensed (SIL OFL) fonts, so the PDF and the editor's preview look the
  same everywhere. Classic uses Georgia where it's installed and the metric-compatible
  [Gelasio](https://github.com/SorkinType/Gelasio) elsewhere (e.g. Linux CI), so line breaks and page
  count stay the same; modern bundles [Inter](https://github.com/rsms/inter) and compact
  [Source Sans 3](https://github.com/adobe-fonts/source-sans).
- `theme.json`: its title, description, default accent (`null` for none), and `docx` settings for
  Word (font, colours, sizes, header alignment, heading style). Word is built in code in
  `src/resumake/renderers/docx.py`, so the result is a normal, editable Word document that follows
  the theme closely but isn't a pixel copy of the PDF. Word uses fonts installed on the reader's
  computer, so `docx.font` names a common one (Georgia, Arial, Calibri) rather than the bundled
  web font.

To add a theme, copy a theme folder, change its stylesheet and `theme.json`, and run
`resumake schema -o web/src/lib/schema.json` so the schema (and the editor) know its name.

Markdown has one shared template: `src/resumake/templates/resume.md.j2`.

To add a format, write a `render(ctx, out_path)` function and register it in
`src/resumake/renderers/__init__.py`.

## Web editor

[`web/`](web/) is a browser editor for resume YAML, live at
**https://resumake.chasestrickler.com**: highlighting, field autocomplete, validation
against the same schema as `resumake validate` with errors on the exact line, and a live preview
rendered by resumake's own Python and template running in the browser (Pyodide). It handles tailored
variants too: open a `resumes/` folder and `extends:` is resolved across files. With GitHub sign-in
it opens your resumes repo directly and saves changes back as a branch and pull request. See [`web/README.md`](web/README.md).

```bash
cd web && npm install && npm run dev
```

## Development

```bash
pytest
```
