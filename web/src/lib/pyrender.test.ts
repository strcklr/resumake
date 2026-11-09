import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import sample from '../../../resumes/default.yml?raw';
import { installResumake, pythonError, resumakeFiles, WHEELS, type Render } from './pyrender';
import { validate } from './validate';

const pyodideDir = dirname(createRequire(import.meta.url).resolve('pyodide/package.json'));
const publicPy = join(import.meta.dirname, '../../public/py');

describe('resumakeFiles', () => {
  it('stands in for renderers/__init__ and inlines the fonts', () => {
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
      expect(css).toMatch(/url\("data:font\/woff2;base64,/);
    }
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
