/**
 * Run resumake's own Python in Pyodide to render the HTML preview.
 *
 * Only the pieces the HTML renderer needs are loaded: `context.py` (the view model shared by
 * every format), `themes.py`, `renderers/html.py`, `renderers/_templates.py`, the shared templates
 * and every theme's theme.json and stylesheet, so `layout.theme` works here too. Fonts are not
 * bundled in: a stylesheet's `url(fonts/...)` becomes a FONT_SCHEME placeholder, and `inlineFonts`
 * swaps in the fonts a rendered page uses, fetched the first time a theme is used. The real
 * `renderers/__init__.py` imports the PDF and Word renderers (WeasyPrint, python-docx), so a
 * one-line stand-in replaces it here. YAML parsing and validation already happened in the editor,
 * so Python receives plain JSON and needs neither PyYAML nor jsonschema: just Jinja2 and MarkupSafe.
 *
 * Shared by the browser worker and the tests, so the tests exercise the same setup.
 */
import type { PyodideAPI } from 'pyodide';

const SRC = '../../../src/resumake/';
const python = import.meta.glob(
  [
    '../../../src/resumake/__init__.py',
    '../../../src/resumake/context.py',
    '../../../src/resumake/themes.py',
    '../../../src/resumake/renderers/html.py',
    '../../../src/resumake/renderers/_templates.py',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const templates = import.meta.glob('../../../src/resumake/templates/*.{j2,css}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const themeFiles = import.meta.glob('../../../src/resumake/themes/*/{theme.json,style.css,resume.html.j2}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
// Each font is its own asset, fetched only when a rendered resume uses its theme.
const fonts = import.meta.glob('../../../src/resumake/themes/*/fonts/*.woff2', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Placeholder for a theme's font in rendered HTML: `resumake-font:<theme>/<file>`. */
export const FONT_SCHEME = 'resumake-font:';
const FONT_REF = /resumake-font:([\w-]+)\/([\w.-]+)/g;

/** Where a theme's font is served (relative to the site, as Vite emitted it), or undefined. */
export function fontUrl(theme: string, file: string): string | undefined {
  return fonts[`${SRC}themes/${theme}/fonts/${file}`];
}

/** Where resumake's sources are written inside Pyodide's virtual filesystem. */
const ROOT = '/resumake-src';

export const WHEELS = ['jinja2-3.1.6-py3-none-any.whl', 'markupsafe-3.0.3-py3-none-any.whl'];

/** resumake's files as they'll sit under ROOT, keyed by package-relative path. */
export function resumakeFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [path, text] of Object.entries({ ...python, ...templates, ...themeFiles })) {
    files['resumake/' + path.slice(SRC.length)] = text;
  }
  files['resumake/renderers/__init__.py'] =
    '"""Browser build: only the HTML renderer is loaded (no PDF or Word dependencies)."""\n';

  // Each theme's stylesheet points at its own fonts/ folder; mark those for inlineFonts.
  for (const key of Object.keys(files)) {
    const theme = /^resumake\/themes\/([\w-]+)\/style\.css$/.exec(key)?.[1];
    if (!theme) continue;
    files[key] = files[key].replace(/url\(fonts\/([\w.-]+)\)/g, (match, name: string) =>
      fontUrl(theme, name) ? `url("${FONT_SCHEME}${theme}/${name}")` : match,
    );
  }
  return files;
}

/**
 * Replace the font placeholders in rendered HTML with data: URLs, so the page (and a downloaded
 * copy of it) needs no other files. `load(theme, file)` returns a font's data: URL; the worker
 * fetches and caches them.
 */
export async function inlineFonts(html: string, load: (theme: string, file: string) => Promise<string>): Promise<string> {
  const refs = new Map<string, [string, string]>();
  for (const m of html.matchAll(FONT_REF)) refs.set(m[0], [m[1], m[2]]);
  const urls = new Map(await Promise.all([...refs].map(async ([ref, [theme, file]]) => [ref, await load(theme, file)] as const)));
  return html.replace(FONT_REF, (ref) => urls.get(ref) ?? ref);
}

/** Where a resumes repo's own themes (its `themes/` folder) are written. */
const REPO_THEMES = '/repo-themes';

const BOOT = `
import json
from pathlib import Path
from resumake import themes
from resumake.context import build_context
from resumake.renderers.html import render_string

def render(data_json, with_repo_themes):
    dirs = (Path(${JSON.stringify(REPO_THEMES)}),) if with_repo_themes else ()
    return render_string(build_context(json.loads(data_json), dirs))

def forget_themes():
    themes._load.cache_clear()
`;

export interface Render {
  (data: unknown): string;
  /** Replace the repo's own themes (see ThemeFiles); renders after this use them. */
  setRepoThemes(files: Record<string, string>): void;
}

/**
 * Install Jinja2/MarkupSafe from wheel bytes and resumake from source, and return a renderer.
 * `wheels` are the contents of the files named in WHEELS.
 */
export function installResumake(py: PyodideAPI, wheels: ArrayBuffer[]): Render {
  for (const wheel of wheels) py.unpackArchive(wheel, 'wheel');
  for (const [path, text] of Object.entries(resumakeFiles())) {
    const full = `${ROOT}/${path}`;
    py.FS.mkdirTree(full.slice(0, full.lastIndexOf('/')));
    py.FS.writeFile(full, text);
  }
  py.runPython(`import sys\nsys.path.insert(0, ${JSON.stringify(ROOT)})`);
  py.runPython(BOOT);
  const render = py.globals.get('render');
  const forget = py.globals.get('forget_themes');
  let hasRepoThemes = false;
  const out = ((data: unknown) => render(JSON.stringify(data), hasRepoThemes) as string) as Render;
  out.setRepoThemes = (files) => {
    rmTree(py, REPO_THEMES);
    for (const [path, text] of Object.entries(repoThemeFiles(files))) {
      const full = `${REPO_THEMES}/${path}`;
      py.FS.mkdirTree(full.slice(0, full.lastIndexOf('/')));
      py.FS.writeFile(full, text);
    }
    hasRepoThemes = Object.keys(files).length > 0;
    forget();
  };
  return out;
}

/**
 * A repo's theme files as Python will read them: fonts aren't written (their `data:` URLs go
 * straight into the stylesheet in place of `url(fonts/...)`, so the rendered page is self-contained).
 */
export function repoThemeFiles(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, text] of Object.entries(files)) {
    if (/\/fonts\//.test(path)) continue;
    const theme = /^([\w-]+)\/style\.css$/.exec(path)?.[1];
    out[path] = theme
      ? text.replace(/url\((["']?)fonts\/([\w.-]+)\1\)/g, (match, _q, name: string) => {
          const font = files[`${theme}/fonts/${name}`];
          return font ? `url("${font}")` : match;
        })
      : text;
  }
  return out;
}

function rmTree(py: PyodideAPI, dir: string) {
  const fs = py.FS as unknown as {
    analyzePath(p: string): { exists: boolean };
    readdir(p: string): string[];
    stat(p: string): { mode: number };
    isDir(mode: number): boolean;
    unlink(p: string): void;
    rmdir(p: string): void;
  };
  if (!fs.analyzePath(dir).exists) return;
  for (const name of fs.readdir(dir)) {
    if (name === '.' || name === '..') continue;
    const path = `${dir}/${name}`;
    if (fs.isDir(fs.stat(path).mode)) rmTree(py, path);
    else fs.unlink(path);
  }
  fs.rmdir(dir);
}

/** Turn a Python exception into its last line ("KeyError: 'name'"), which is the useful part. */
export function pythonError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  const lines = text.trim().split('\n');
  return lines[lines.length - 1] || 'Rendering failed';
}
