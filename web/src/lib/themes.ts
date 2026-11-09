/**
 * resumake's themes, read from each theme's theme.json (src/resumake/themes/<name>/), for the
 * picker and autocomplete. The rendering itself happens in Python (pyrender.ts).
 */
export interface ThemeInfo {
  name: string;
  title: string;
  description: string;
  /** Default accent colour (`#rrggbb`), or null if the theme has no colour. */
  accent: string | null;
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

export function themeInfo(name: string | undefined): ThemeInfo {
  return THEMES.find((t) => t.name === name) ?? THEMES.find((t) => t.name === DEFAULT_THEME)!;
}

/** The theme and accent a resolved resume uses, as resumake's context.py works them out. */
export function effectiveLook(data: unknown): { theme: ThemeInfo; accent: string | null } {
  const layout = (data as { layout?: { theme?: unknown; accent?: unknown } } | null)?.layout;
  const theme = themeInfo(typeof layout?.theme === 'string' ? layout.theme : undefined);
  const accent = typeof layout?.accent === 'string' ? layout.accent : null;
  return { theme, accent: theme.accent ? (accent ?? theme.accent) : null };
}
