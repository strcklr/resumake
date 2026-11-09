import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import sample from '../../../resumes/default.yml?raw';
import { fontUrl, FONT_SCHEME, inlineFonts, installResumake, pythonError, resumakeFiles, WHEELS, type Render } from './pyrender';
import { THEMES } from './themes';
import { validate } from './validate';

const pyodideDir = dirname(createRequire(import.meta.url).resolve('pyodide/package.json'));
const publicPy = join(import.meta.dirname, '../../public/py');

// The parity test renders with the CLI's own Python too. CI installs resumake (web.yml); locally it
// runs when `python3 -c "import resumake"` works, and is skipped otherwise.
const hasCli = spawnSync('python3', ['-c', 'import resumake']).status === 0;
const CLI_RENDER = `
import json, sys
from resumake.context import build_context
from resumake.renderers.html import render_string
sys.stdout.write(render_string(build_context(json.load(sys.stdin))))
`;
function renderWithCli(data: unknown): string {
  return execFileSync('python3', ['-c', CLI_RENDER], { input: JSON.stringify(data), encoding: 'utf-8' });
}

describe('resumakeFiles', () => {
  it('stands in for renderers/__init__ and marks each theme’s fonts for inlining', () => {
    const files = resumakeFiles();
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        'resumake/context.py',
        'resumake/renderers/html.py',
        'resumake/renderers/__init__.py',
        'resumake/templates/resume.html.j2',
        'resumake/themes.py',
        'resumake/themes/classic/theme.json',
        'resumake/themes/modern/style.css',
        'resumake/themes/compact/style.css',
      ]),
    );
    expect(files['resumake/renderers/__init__.py']).not.toMatch(/import/);
    for (const theme of ['classic', 'modern', 'compact']) {
      const css = files[`resumake/themes/${theme}/style.css`];
      expect(css).not.toMatch(/url\(fonts\//);
      const refs = [...css.matchAll(/url\("resumake-font:([\w-]+)\/([\w.-]+)"\)/g)];
      expect(refs.length).toBeGreaterThan(0);
      for (const [, t, file] of refs) {
        expect(t).toBe(theme);
        expect(fontUrl(t, file)).toBeTruthy();
      }
    }
  });
});

describe('inlineFonts', () => {
  it('loads each font once and swaps in its data: URL', async () => {
    const html = `a url("${FONT_SCHEME}modern/inter.woff2") b url("${FONT_SCHEME}modern/inter.woff2") c url("${FONT_SCHEME}classic/g.woff2")`;
    const loaded: string[] = [];
    const out = await inlineFonts(html, async (theme, file) => {
      loaded.push(`${theme}/${file}`);
      return `data:${theme}-${file}`;
    });
    expect(out).toBe('a url("data:modern-inter.woff2") b url("data:modern-inter.woff2") c url("data:classic-g.woff2")');
    expect(loaded).toEqual(['modern/inter.woff2', 'classic/g.woff2']);
  });

  it('leaves a page without fonts alone', async () => {
    expect(await inlineFonts('<p>hi</p>', async () => 'x')).toBe('<p>hi</p>');
  });
});

describe('rendering in Pyodide', () => {
  let render: Render;

  beforeAll(async () => {
    const py = await loadPyodide({ indexURL: pyodideDir + '/' });
    const wheels = WHEELS.map((name) => {
      const buf = readFileSync(join(publicPy, name));
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    });
    render = installResumake(py, wheels);
  });

  it('renders the sample with resumake’s HTML template', () => {
    const html = render(validate(sample).data);
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<h1>Jordan Example</h1>');
    expect(html).toContain('Acme Analytics');
    expect(html).toContain('Feb 2023'); // dates are formatted by resumake's context.py
  });

  it('renders each theme, with layout.accent only where the theme uses colour', () => {
    const data = validate(sample).data as Record<string, unknown>;
    const withTheme = (layout: Record<string, string>) =>
      render({ ...data, layout: { ...(data.layout as object), ...layout } });
    expect(render(data)).toContain('Georgia');
    expect(withTheme({ theme: 'modern' })).toContain('font-family: Inter');
    expect(withTheme({ theme: 'modern', accent: '#4338ca' })).toContain('--accent: #4338ca');
    expect(withTheme({ theme: 'compact' })).toContain('Source Sans 3');
    expect(withTheme({ theme: 'compact', accent: '#4338ca' })).not.toContain('#4338ca');
  });

  it.skipIf(!hasCli && !process.env.CI)('matches the CLI’s HTML in every theme', () => {
    const data = validate(sample).data as Record<string, unknown>;
    for (const theme of THEMES) {
      const layout = { ...(data.layout as object), theme: theme.name, ...(theme.accent ? { accent: '#4338ca' } : {}) };
      const resume = { ...data, layout };
      // The browser's stylesheets point at fonts it inlines later; the CLI's at the theme's fonts/ folder.
      const browser = render(resume).replace(/url\("resumake-font:[\w-]+\/([\w.-]+)"\)/g, 'url(fonts/$1)');
      expect(browser, theme.name).toBe(renderWithCli(resume));
    }
  });

  it('renders with the repo’s own themes, and forgets them when they change', () => {
    const data = { basics: { name: 'A' }, layout: { theme: 'mine' } };
    render.setRepoThemes({
      'mine/theme.json': '{"title": "Mine"}',
      'mine/style.css': '@font-face { src: url(fonts/a.woff2) } body { color: rebeccapurple }',
      'mine/fonts/a.woff2': 'data:font/woff2;base64,AAAA',
      'mine/resume.html.j2': '<!doctype html><style>{{ css | safe }}</style><h1 class="mine">{{ basics.name }}</h1>',
    });
    const html = render(data);
    expect(html).toContain('<h1 class="mine">A</h1>');
    expect(html).toContain('rebeccapurple');
    expect(html).toContain('url("data:font/woff2;base64,AAAA")');

    render.setRepoThemes({ 'mine/theme.json': '{}', 'mine/style.css': 'body { color: teal }' });
    const next = render(data);
    expect(next).toContain('teal');
    expect(next).not.toContain('class="mine"'); // the old template is gone; the shared one is used

    render.setRepoThemes({});
    expect(() => render(data)).toThrow(/unknown theme 'mine'/);
  });

  it('escapes text from the resume', () => {
    const html = render({ basics: { name: '<script>alert(1)</script>' } });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('reports Python errors on one line', () => {
    let message = '';
    try {
      render({});
    } catch (err) {
      message = pythonError(err);
    }
    expect(message).toMatch(/Error/);
    expect(message).not.toContain('\n');
  });
});
