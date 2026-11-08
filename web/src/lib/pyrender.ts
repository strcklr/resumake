/**
 * Run resumake's own Python in Pyodide to render the HTML preview.
 *
 * Only the pieces the HTML renderer needs are loaded: `context.py` (the view model shared by
 * every format), `renderers/html.py`, `renderers/_templates.py` and the templates. The real
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
// Inlined as data: URLs so the preview iframe needs no extra requests for them.
const fonts = import.meta.glob('../../../src/resumake/templates/fonts/*.woff2', {
  query: '?inline',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Where resumake's sources are written inside Pyodide's virtual filesystem. */
const ROOT = '/resumake-src';

export const WHEELS = ['jinja2-3.1.6-py3-none-any.whl', 'markupsafe-3.0.3-py3-none-any.whl'];

/** resumake's files as they'll sit under ROOT, keyed by package-relative path. */
export function resumakeFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [path, text] of Object.entries({ ...python, ...templates })) {
    files['resumake/' + path.slice(SRC.length)] = text;
  }
  files['resumake/renderers/__init__.py'] =
    '"""Browser build: only the HTML renderer is loaded (no PDF or Word dependencies)."""\n';

  const fontUrl = (name: string) => fonts[`${SRC}templates/fonts/${name}`];
  files['resumake/templates/style.css'] = files['resumake/templates/style.css'].replace(
    /url\(fonts\/([\w.-]+)\)/g,
    (match, name: string) => (fontUrl(name) ? `url("${fontUrl(name)}")` : match),
  );
  return files;
}

const BOOT = `
import json
from resumake.context import build_context
from resumake.renderers.html import render_string

def render(data_json):
    return render_string(build_context(json.loads(data_json)))
`;

export type Render = (data: unknown) => string;

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
  return (data) => render(JSON.stringify(data)) as string;
}

/** Turn a Python exception into its last line ("KeyError: 'name'"), which is the useful part. */
export function pythonError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  const lines = text.trim().split('\n');
  return lines[lines.length - 1] || 'Rendering failed';
}
