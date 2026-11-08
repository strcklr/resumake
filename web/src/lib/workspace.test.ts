import { describe, expect, it } from 'vitest';
import { isPartial, originFile, resolvePath, Workspace, type FileProblem, type Files } from './workspace';

// The cases the CLI is tested against too (tests/test_resumake.py::test_shared_extends_cases).
const raw = import.meta.glob('../../../tests/fixtures/extends/*/**/*.{yml,json}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const PREFIX = '../../../tests/fixtures/extends/';
const cases = new Map<string, { files: Files; expected: { entry: string; data?: unknown; error?: string } }>();
for (const [path, text] of Object.entries(raw)) {
  const [name, ...rest] = path.slice(PREFIX.length).split('/');
  const c = cases.get(name) ?? { files: {}, expected: { entry: '' } };
  if (rest.join('/') === 'expected.json') c.expected = JSON.parse(text);
  else c.files[rest.join('/')] = text;
  cases.set(name, c);
}

describe('shared extends cases (same as the CLI)', () => {
  it('found the cases', () => {
    expect([...cases.keys()].sort()).toEqual(
      ['chain', 'circular', 'list-parents', 'lists-replace', 'missing', 'null-removes', 'parent-nulls'],
    );
  });

  for (const [name, { files, expected }] of cases) {
    it(name, () => {
      const result = new Workspace(files).resolve(expected.entry);
      if (expected.error) {
        expect(result.data).toBeUndefined();
        const pattern = { circular: /circular extends/, 'not found': /can't find/ }[expected.error]!;
        expect(result.problems.map((p) => p.message).join('\n')).toMatch(pattern);
      } else {
        expect(result.data).toEqual(expected.data);
      }
    });
  }
});

/** The problem's file, line and underlined text, for compact assertions. */
function where(files: Files, p: FileProblem) {
  return { file: p.file, line: p.line, text: files[p.file].slice(p.from, p.to), message: p.message };
}

const BASE = `basics:
  name: Jordan
  label: Engineer
work:
  - company: Acme
    position: Dev
    start: 2021-03
`;

describe('mapping problems back to files', () => {
  it('reports a bad value in the parent that supplied it', () => {
    const files = {
      'default.yml': BASE.replace('start: 2021-03', 'start: [2021]'),
      'tailored/acme.yml': 'extends: ../default.yml\nbasics:\n  label: Platform Engineer\n',
    };
    const [p] = new Workspace(files).resolve('tailored/acme.yml').problems;
    expect(where(files, p)).toMatchObject({ file: 'default.yml', line: 7, text: 'start', message: expect.stringMatching(/must be a date/) });
  });

  it('reports an unknown field in the file that wrote it', () => {
    const files = { 'default.yml': BASE, 'acme.yml': 'extends: default.yml\nbasics:\n  lable: typo\n' };
    const [p] = new Workspace(files).resolve('acme.yml').problems;
    expect(where(files, p)).toEqual({ file: 'acme.yml', line: 3, text: 'lable', message: "unknown field 'lable'" });
  });

  it('reports an incomplete entry where the entry is written', () => {
    const files = {
      'default.yml': BASE.replace('    position: Dev\n', ''),
      'acme.yml': 'extends: default.yml\n',
    };
    const [p] = new Workspace(files).resolve('acme.yml').problems;
    expect(where(files, p)).toMatchObject({ file: 'default.yml', line: 5, message: "needs 'position' or 'roles'" });
  });

  it('reports a value replaced by the child in the child', () => {
    const files = { 'default.yml': BASE, 'acme.yml': 'extends: default.yml\nwork:\n  - company: Other\n' };
    const [p] = new Workspace(files).resolve('acme.yml').problems;
    expect(where(files, p)).toMatchObject({ file: 'acme.yml', line: 3 });
  });

  it('reports a missing parent on the extends line', () => {
    const files = { 'acme.yml': 'basics:\n  name: A\nextends: [default.yml, nope.yml]\n', 'default.yml': BASE };
    const result = new Workspace(files).resolve('acme.yml');
    expect(result.data).toBeUndefined();
    expect(where(files, result.problems[0])).toEqual({ file: 'acme.yml', line: 3, text: 'nope.yml', message: "can't find nope.yml" });
  });

  it('reports a cycle in the file that closes it', () => {
    const files = { 'a.yml': 'extends: b.yml\nbasics: {name: A}\n', 'b.yml': '# b\nextends: a.yml\n' };
    const problems = new Workspace(files).resolve('a.yml').problems.map((p) => where(files, p));
    expect(problems).toContainEqual({ file: 'b.yml', line: 2, text: 'a.yml', message: 'circular extends: a.yml → b.yml → a.yml' });
    expect(problems).toContainEqual({ file: 'a.yml', line: 1, text: 'b.yml', message: "can't use b.yml until its problems are fixed" });
  });

  it('reports YAML errors in a parent, and points the child at it', () => {
    const files = { 'default.yml': 'basics:\n  name: [oops\n', 'acme.yml': 'extends: default.yml\n' };
    const problems = new Workspace(files).resolve('acme.yml').problems;
    expect(problems.map((p) => p.file)).toEqual(['acme.yml', 'default.yml']);
    expect(problems[1].message).toMatch(/^YAML:/);
  });

  it('lists the entry file’s problems first', () => {
    const files = {
      'default.yml': BASE.replace('start: 2021-03', 'start: [2021]'),
      'acme.yml': 'extends: default.yml\nbasics:\n  lable: typo\n',
    };
    expect(new Workspace(files).resolve('acme.yml').problems.map((p) => p.file)).toEqual(['acme.yml', 'default.yml']);
  });

  it('skips schema checks for shared fragments, like the CLI', () => {
    const files = { '_shared/contact.yml': 'basics:\n  website: https://example.com\n' };
    expect(new Workspace(files).resolve('_shared/contact.yml').problems).toEqual([]);
  });

  it('accepts a valid tailored resume', () => {
    const files = { 'default.yml': BASE, 'tailored/acme.yml': 'extends: ../default.yml\nbasics:\n  label: Platform\n' };
    const result = new Workspace(files).resolve('tailored/acme.yml');
    expect(result.problems).toEqual([]);
    expect(result.files.sort()).toEqual(['default.yml', 'tailored/acme.yml']);
  });
});

describe('origins', () => {
  it('says which file each value comes from', () => {
    const files = { 'default.yml': BASE, 'acme.yml': 'extends: default.yml\nbasics:\n  label: Platform\n' };
    const { origin } = new Workspace(files).resolve('acme.yml');
    expect(originFile(origin!, ['basics', 'label'])).toBe('acme.yml');
    expect(originFile(origin!, ['basics', 'name'])).toBe('default.yml');
    expect(originFile(origin!, ['work', 0, 'company'])).toBe('default.yml');
  });
});

describe('paths', () => {
  it('resolves relative to the file’s folder', () => {
    expect(resolvePath('resumes/tailored/acme.yml', '../default.yml')).toBe('resumes/default.yml');
    expect(resolvePath('resumes/default.yml', './_shared/x.yml')).toBe('resumes/_shared/x.yml');
    expect(resolvePath('default.yml', '../outside.yml')).toBeUndefined();
    expect(resolvePath('default.yml', '/abs.yml')).toBeUndefined();
  });

  it('spots shared fragments', () => {
    expect(isPartial('resumes/_shared/contact.yml')).toBe(true);
    expect(isPartial('_base.yml')).toBe(true);
    expect(isPartial('resumes/tailored/acme.yml')).toBe(false);
  });
});
