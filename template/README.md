# My resumes

Resume sources, built by [resumake](https://github.com/strcklr/resumake). Made from the
[resumes-template](https://github.com/strcklr/resumes-template) repo: keep this repo **private**.

```
resumes/
├── default.yml            # base resume
└── tailored/
    ├── _example.yml       # copy-me template (files starting with _ aren't built)
    └── <company-role>.yml # one per application: `extends: ../default.yml`
```

## Workflow

1. Copy `resumes/tailored/_example.yml` to `resumes/tailored/<company-role>.yml`.
2. Fill in its `job:` block (link, date, pasted posting). It's kept for your
   records and never appears in the output.
3. Override whatever should differ from `default.yml`.
4. Open a pull request to get a preview build as a workflow artifact, then merge.
   Merges to `main` publish a GitHub Release with every format.

Replace the fictional sample in `default.yml` with your own resume first.

## Editing in your browser

[resumake.chasestrickler.com](https://resumake.chasestrickler.com) checks and previews your
resumes as you type, `extends:` included. Nothing you type leaves your browser.

1. Clone or download this repo, then use **Open folder** in the editor and pick `resumes/`.
2. Edit, then **Download all** for a `.zip` of every file.
3. Unzip it over `resumes/` and commit, or upload the files on GitHub (**Add file → Upload files**
   in the `resumes/` folder).

## Building locally

```bash
pip install git+https://github.com/strcklr/resumake
resumake validate
resumake build            # writes dist/
```

PDF output needs Pango (`brew install pango` on macOS).
