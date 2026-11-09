import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { applyChange, ownLayoutField, setLayoutField, type LayoutKey } from './layout';

const set = (text: string, key: LayoutKey, value: string | null) => applyChange(text, setLayoutField(text, key, value));

describe('setLayoutField', () => {
  it('adds a layout block at the end, keeping comments', () => {
    const text = '# My resume\nbasics:\n  name: A # me\n';
    expect(set(text, 'theme', 'modern')).toBe('# My resume\nbasics:\n  name: A # me\n\nlayout:\n  theme: modern\n');
  });

  it('adds a layout block to a file without a final newline', () => {
    expect(set('basics:\n  name: A', 'theme', 'compact')).toBe('basics:\n  name: A\n\nlayout:\n  theme: compact\n');
  });

  it('quotes colours, since an unquoted # starts a comment', () => {
    const out = set('basics:\n  name: A\n', 'accent', '#4338ca');
    expect(out).toContain('accent: "#4338ca"');
    expect(parse(out).layout.accent).toBe('#4338ca');
  });

  it('replaces an existing value in place, keeping its comment', () => {
    const text = 'layout:\n  theme: classic  # for now\n  sections: [summary, work]\nbasics:\n  name: A\n';
    expect(set(text, 'theme', 'modern')).toBe(
      'layout:\n  theme: modern  # for now\n  sections: [summary, work]\nbasics:\n  name: A\n',
    );
  });

  it('adds a field after the last one in layout, at its indent', () => {
    const text = 'layout:\n    sections:\n      - summary\n      - work\nbasics:\n  name: A\n';
    const out = set(text, 'theme', 'compact');
    expect(out).toBe('layout:\n    sections:\n      - summary\n      - work\n    theme: compact\nbasics:\n  name: A\n');
    expect(parse(out).layout).toEqual({ sections: ['summary', 'work'], theme: 'compact' });
  });

  it('adds a field to a layout at the very end of a file with no final newline', () => {
    expect(set('layout:\n  theme: modern', 'accent', '#000000')).toBe('layout:\n  theme: modern\n  accent: "#000000"\n');
  });

  it('removes a field, and layout itself when that was its only field', () => {
    const both = 'basics:\n  name: A\nlayout:\n  theme: modern\n  accent: "#4338ca" # brand\n';
    expect(set(both, 'accent', null)).toBe('basics:\n  name: A\nlayout:\n  theme: modern\n');
    expect(set('basics:\n  name: A\nlayout:\n  accent: "#4338ca"\nwork: []\n', 'accent', null)).toBe(
      'basics:\n  name: A\nwork: []\n',
    );
  });

  it('makes no change when there is nothing to do', () => {
    expect(setLayoutField('layout:\n  theme: modern\n', 'theme', 'modern')).toBeNull();
    expect(setLayoutField('basics:\n  name: A\n', 'accent', null)).toBeNull();
  });

  it('leaves files with YAML syntax errors alone', () => {
    expect(setLayoutField('basics: [\n', 'theme', 'modern')).toBeNull();
  });

  it('handles a flow-style layout by rewriting it', () => {
    const out = set('basics: {name: A}\nlayout: {theme: classic}\n', 'theme', 'modern');
    expect(parse(out).layout).toEqual({ theme: 'modern' });
  });

  it('works on an empty file', () => {
    expect(set('', 'theme', 'modern')).toBe('layout:\n  theme: modern\n');
  });
});

describe('ownLayoutField', () => {
  it('reads only what the file itself sets', () => {
    expect(ownLayoutField('layout:\n  accent: "#123456"\n', 'accent')).toBe('#123456');
    expect(ownLayoutField('extends: ../default.yml\n', 'accent')).toBeUndefined();
  });
});
