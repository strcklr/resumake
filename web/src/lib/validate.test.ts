import { describe, expect, it } from 'vitest';
import sample from '../../../resumes/default.yml?raw';
import tailored from '../../../resumes/tailored/example-platform.yml?raw';
import { suggest, suggestValue } from './complete';
import { validate } from './validate';

const lineOf = (text: string, needle: string) => text.split('\n').findIndex((l) => l.includes(needle)) + 1;

describe('validate', () => {
  it('accepts the sample resume', () => {
    expect(validate(sample).problems).toEqual([]);
  });

  it('checks a tailored resume on its own and warns about extends', () => {
    const { problems } = validate(tailored);
    expect(problems[0]).toMatchObject({ severity: 'warning', path: 'extends' });
  });

  it('reports YAML syntax errors with a position', () => {
    const { problems } = validate('basics:\n  name: [unclosed\n');
    expect(problems[0].severity).toBe('error');
    expect(problems[0].message).toMatch(/^YAML:/);
  });

  it('points a missing required field at the key that holds the mapping', () => {
    const text = 'basics:\n  name: A\nwork:\n  - company: Acme\n    roles:\n      - start: 2021\n';
    const { problems } = validate(text);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ path: 'work[0].roles[0]', message: "'position' is required", line: 6 });
  });

  it('underlines an unknown field itself', () => {
    const text = 'basics:\n  name: A\n  nmae: typo\n';
    const [p] = validate(text).problems;
    expect(p).toMatchObject({ message: "unknown field 'nmae'", line: 3, col: 3 });
    expect(text.slice(p.from, p.to)).toBe('nmae');
  });

  it('collapses the position-or-roles rule into one message', () => {
    const { problems } = validate('basics:\n  name: A\nwork:\n  - company: Acme\n');
    expect(problems.map((p) => p.message)).toEqual(["needs 'position' or 'roles'"]);
  });

  it('describes wrong types in plain words', () => {
    const text = 'basics:\n  name: A\nwork:\n  - company: Acme\n    position: Dev\n    start: [2021]\n';
    const [p] = validate(text).problems;
    expect(p.message).toBe('must be a date, like 2021, 2021-03 or 2021-03-15');
    expect(p.line).toBe(lineOf(text, 'start'));
  });

  it('lists the allowed section names', () => {
    const [p] = validate('basics:\n  name: A\nlayout:\n  sections: [summary, hobbies]\n').problems;
    expect(p.message).toMatch(/^must be one of: summary, work/);
    expect(p.path).toBe('layout.sections[1]');
  });

  it('treats an empty document as missing basics', () => {
    expect(validate('').problems.map((p) => p.message)).toEqual(["'basics' is required"]);
  });

  it('explains an unquoted accent colour', () => {
    const [problem] = validate('basics:\n  name: A\nlayout:\n  theme: modern\n  accent: #4338ca\n').problems;
    expect(problem.path).toBe('layout.accent');
    expect(problem.message).toMatch(/in quotes/);
  });

  it('rejects a top level that is not a mapping', () => {
    expect(validate('- just\n- a list\n').problems[0].message).toMatch(/top level must be a mapping/);
  });
});

describe('suggest', () => {
  const at = (doc: string) => {
    const lines = doc.split('\n');
    return suggest(lines, lines.length - 1)?.map((s) => s.label) ?? null;
  };

  it('offers top-level sections', () => {
    expect(at('wo')).toContain('work');
  });

  it('offers fields of a list item and skips ones already present', () => {
    const labels = at('basics:\n  name: A\nwork:\n  - company: Acme\n    ');
    expect(labels).toContain('position');
    expect(labels).toContain('roles');
    expect(labels).not.toContain('company');
  });

  it('offers role fields under roles', () => {
    expect(at('work:\n  - company: A\n    roles:\n      - ')).toEqual(
      expect.arrayContaining(['position', 'start', 'end', 'highlights']),
    );
  });

  it('offers section names in layout.sections', () => {
    expect(at('layout:\n  sections:\n    - ')).toContain('certifications');
  });

  it('stays quiet after a colon', () => {
    expect(at('basics:\n  name: Jo')).toBeNull();
  });

  it('marks theme and accent as fields with suggested values', () => {
    const fields = suggest(['layout:', '  '], 1)!;
    expect(fields.find((f) => f.label === 'theme')?.hasValues).toBe(true);
    expect(fields.find((f) => f.label === 'accent')?.hasValues).toBe(true);
    expect(fields.find((f) => f.label === 'output_name')?.hasValues).toBe(false);
  });
});

describe('suggestValue', () => {
  const at = (doc: string) => {
    const lines = doc.split('\n');
    return suggestValue(lines, lines.length - 1);
  };

  it('offers themes for layout.theme, with their titles', () => {
    const out = at('layout:\n  theme: mo')!;
    expect(out.options.map((o) => o.label)).toEqual(['classic', 'compact', 'modern']);
    expect(out.options.find((o) => o.label === 'modern')?.detail).toMatch(/Modern/);
    expect(out.start).toBe('  theme: '.length);
  });

  it('offers quoted colours for layout.accent, replacing a partly typed one', () => {
    const out = at('layout:\n  accent: "#0f')!;
    expect(out.options.map((o) => o.apply)).toContain('"#0f766e"');
    expect(out.start).toBe('  accent: '.length);
  });

  it('stays quiet for free-text fields and other parents', () => {
    expect(at('basics:\n  name: Jo')).toBeNull();
    expect(at('basics:\n  theme: x')).toBeNull();
  });
});
