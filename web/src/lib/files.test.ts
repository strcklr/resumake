import { describe, expect, it } from 'vitest';
import { invalidName, newVariant, outputName, relativePath, sampleWorkspace, sortPaths } from './files';
import { Workspace } from './workspace';

describe('files', () => {
  it('ships a sample whose tailored variant resolves cleanly', () => {
    const { files } = sampleWorkspace();
    const ws = new Workspace(files);
    for (const path of Object.keys(files)) expect(ws.resolve(path).problems).toEqual([]);
  });

  it('writes extends paths relative to the new file', () => {
    expect(relativePath('tailored/acme.yml', 'default.yml')).toBe('../default.yml');
    expect(relativePath('acme.yml', 'default.yml')).toBe('default.yml');
    expect(relativePath('a/b/c.yml', 'a/base.yml')).toBe('../base.yml');
    expect(relativePath('x/c.yml', 'y/base.yml')).toBe('../y/base.yml');
  });

  it('starts a new variant that resolves against its base', () => {
    const files = { ...sampleWorkspace().files };
    files['tailored/new.yml'] = newVariant('tailored/new.yml', 'default.yml');
    expect(new Workspace(files).resolve('tailored/new.yml').problems).toEqual([]);
  });

  it('checks file names', () => {
    const files = { 'default.yml': '' };
    expect(invalidName('tailored/acme.yml', files)).toBeNull();
    expect(invalidName('acme.txt', files)).toMatch(/\.yml/);
    expect(invalidName('../acme.yml', files)).toMatch(/inside/);
    expect(invalidName('default.yml', files)).toMatch(/exists/);
    expect(invalidName('default.yml', files, 'default.yml')).toBeNull();
  });

  it('orders base files before folders and names outputs like the CLI', () => {
    expect(sortPaths(['tailored/b.yml', 'default.yml', '_shared/x.yml'])).toEqual(['default.yml', '_shared/x.yml', 'tailored/b.yml']);
    expect(outputName('tailored/acme.yml')).toBe('tailored-acme');
  });
});
