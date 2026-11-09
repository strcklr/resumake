import { describe, expect, it } from 'vitest';
import { allThemes, customThemes, effectiveLook, isThemeFile } from './themes';
import { Workspace } from './workspace';

const repo = {
  'mine/theme.json': '{"title": "Mine", "description": "Mine.", "accent": "#123456"}',
  'mine/style.css': 'body {}',
  'half/theme.json': '{}', // no style.css: not a theme
  'classic/theme.json': '{"title": "My classic"}',
  'classic/style.css': 'body {}',
};

describe('repo themes', () => {
  it('reads the repo’s themes, skipping folders without a stylesheet', () => {
    expect(customThemes(repo).map((t) => t.name).sort()).toEqual(['classic', 'mine']);
  });

  it('lists built-in and repo themes together, a repo theme replacing a built-in of the same name', () => {
    const all = allThemes(repo);
    expect(all.map((t) => t.name)).toEqual(['classic', 'compact', 'mine', 'modern']);
    expect(all[0]).toMatchObject({ title: 'My classic', custom: true });
    expect(effectiveLook({ layout: { theme: 'mine' } }, all)).toMatchObject({ accent: '#123456' });
  });

  it('loads only the files resumake reads from a theme folder', () => {
    expect(isThemeFile('mine/style.css')).toBe(true);
    expect(isThemeFile('mine/fonts/x.woff2')).toBe(true);
    expect(isThemeFile('mine/resume.html.j2')).toBe(true);
    expect(isThemeFile('mine/README.md')).toBe(false);
    expect(isThemeFile('style.css')).toBe(false);
  });

  it('accepts a repo theme in layout.theme, and lists them for an unknown one', () => {
    const names = allThemes(repo).map((t) => t.name);
    const ok = new Workspace({ 'a.yml': 'basics:\n  name: A\nlayout:\n  theme: mine\n' }, names).resolve('a.yml');
    expect(ok.problems).toEqual([]);
    const [p] = new Workspace({ 'a.yml': 'basics:\n  name: A\nlayout:\n  theme: fancy\n' }, names).resolve('a.yml').problems;
    expect(p).toMatchObject({ path: 'layout.theme', line: 4 });
    expect(p.message).toBe("unknown theme 'fancy' (choose from classic, compact, mine, modern)");
    // Without the repo's themes, `mine` is unknown.
    expect(new Workspace({ 'a.yml': 'basics:\n  name: A\nlayout:\n  theme: mine\n' }).resolve('a.yml').problems).toHaveLength(1);
  });
});
