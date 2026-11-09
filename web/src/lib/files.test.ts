import { describe, expect, it } from 'vitest';
import { invalidName, neighbor, newVariant, outputName, readPicked, relativePath, sampleWorkspace, sortPaths } from './files';
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

  it('moves to the next tab, or the previous one, when a tab closes', () => {
    expect(neighbor(['a.yml', 'b.yml', 'c.yml'], 'b.yml')).toBe('c.yml');
    expect(neighbor(['a.yml', 'b.yml', 'c.yml'], 'c.yml')).toBe('b.yml');
    expect(neighbor(['a.yml'], 'a.yml')).toBeUndefined();
  });
});

describe('opening a folder', () => {
  const picked = (entries: Record<string, string | Uint8Array>) =>
    Object.entries(entries).map(([path, body]) =>
      Object.assign(new File([body as BlobPart], path.split('/').pop()!), { webkitRelativePath: path }),
    ) as unknown as FileList;

  it('reads a plain folder of resumes', async () => {
    const out = await readPicked(picked({ 'mine/default.yml': 'a', 'mine/tailored/x.yml': 'b', 'mine/notes.txt': 'c' }));
    expect(out).toEqual({ files: { 'default.yml': 'a', 'tailored/x.yml': 'b' }, themes: {} });
  });

  it('reads a resumes repo: resumes/ as the files, themes/ as its themes, nothing else', async () => {
    const out = await readPicked(
      picked({
        'repo/resumes/default.yml': 'a',
        'repo/.github/workflows/build.yml': 'w',
        'repo/themes/mine/theme.json': '{}',
        'repo/themes/mine/style.css': 'body {}',
        'repo/themes/mine/fonts/a.woff2': new Uint8Array([0, 1, 2, 3]),
      }),
    );
    expect(out).toEqual({
      files: { 'default.yml': 'a' },
      themes: { 'mine/theme.json': '{}', 'mine/style.css': 'body {}', 'mine/fonts/a.woff2': 'data:font/woff2;base64,AAECAw==' },
    });
  });
});
