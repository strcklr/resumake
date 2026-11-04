# My resumes

Resume sources, built by [resumake](https://github.com/strcklr/resumake).

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

## Building locally

```bash
pip install git+https://github.com/strcklr/resumake
resumake validate
resumake build            # writes dist/
```

PDF output needs Pango (`brew install pango` on macOS).
