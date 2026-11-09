/**
 * resumake's themes, read from each theme's theme.json (src/resumake/themes/<name>/), plus any in
 * the resumes repo's own `themes/` folder, for the picker, gallery, autocomplete and validation.
 * The rendering itself happens in Python (pyrender.ts).
 */
export interface ThemeInfo {
  name: string;
  title: string;
  description: string;
  /** Default accent colour (`#rrggbb`), or null if the theme has no colour. */
  accent: string | null;
  /** From the resumes repo's `themes/` folder rather than built in. */
  custom?: boolean;
}

/**
 * A repo's own theme files, keyed `<theme>/<path in its folder>` (`mine/style.css`,
 * `mine/fonts/x.woff2`). Text files hold their text; fonts hold a `data:` URL.
 */
export type ThemeFiles = Record<string, string>;

/** Which files of a repo's `themes/` folder the editor loads (the ones resumake's HTML renderer reads). */
export function isThemeFile(rel: string): boolean {
  return /^[A-Za-z0-9][\w-]*\/(theme\.json|style\.css|[\w.-]+\.j2|fonts\/[\w.-]+\.woff2)$/.test(rel);
}

export const DEFAULT_THEME = 'classic';

const meta = import.meta.glob('../../../src/resumake/themes/*/theme.json', {
  import: 'default',
  eager: true,
}) as Record<string, Omit<ThemeInfo, 'name'>>;

/** Every theme, classic first, then by name (the order `resumake themes` lists them). */
export const THEMES: ThemeInfo[] = Object.entries(meta)
  .map(([path, m]) => ({
    name: /themes\/([\w-]+)\/theme\.json$/.exec(path)![1],
    title: m.title,
    description: m.description,
    accent: m.accent ?? null,
  }))
  .sort((a, b) => Number(b.name === DEFAULT_THEME) - Number(a.name === DEFAULT_THEME) || a.name.localeCompare(b.name));

/** The repo's own themes (those with a theme.json and style.css), as resumake's themes.py reads them. */
export function customThemes(files: ThemeFiles): ThemeInfo[] {
  const out: ThemeInfo[] = [];
  for (const [path, text] of Object.entries(files)) {
    const name = /^([\w-]+)\/theme\.json$/.exec(path)?.[1];
    if (!name || !(`${name}/style.css` in files)) continue;
    let meta: Partial<Omit<ThemeInfo, 'name'>> = {};
    try {
      meta = JSON.parse(text);
    } catch {
      /* resumake reports the bad JSON when it renders */
    }
    out.push({
      name,
      title: typeof meta.title === 'string' ? meta.title : name,
      description: typeof meta.description === 'string' ? meta.description : '',
      accent: typeof meta.accent === 'string' ? meta.accent : null,
      custom: true,
    });
  }
  return out;
}

/** Built-in and repo themes, classic first; a repo theme replaces a built-in one of the same name, as in the CLI. */
export function allThemes(files: ThemeFiles = {}): ThemeInfo[] {
  const byName = new Map(THEMES.map((t) => [t.name, t]));
  for (const t of customThemes(files)) byName.set(t.name, t);
  return [...byName.values()].sort(
    (a, b) => Number(b.name === DEFAULT_THEME) - Number(a.name === DEFAULT_THEME) || a.name.localeCompare(b.name),
  );
}

export function themeInfo(name: string | undefined, themes: ThemeInfo[] = THEMES): ThemeInfo {
  return themes.find((t) => t.name === name) ?? themes.find((t) => t.name === DEFAULT_THEME)!;
}

/** The theme and accent a resolved resume uses, as resumake's context.py works them out. */
export function effectiveLook(data: unknown, themes: ThemeInfo[] = THEMES): { theme: ThemeInfo; accent: string | null } {
  const layout = (data as { layout?: { theme?: unknown; accent?: unknown } } | null)?.layout;
  const theme = themeInfo(typeof layout?.theme === 'string' ? layout.theme : undefined, themes);
  const accent = typeof layout?.accent === 'string' ? layout.accent : null;
  return { theme, accent: theme.accent ? (accent ?? theme.accent) : null };
}
