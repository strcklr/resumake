/**
 * Usage counts, sent to a self-hosted Umami instance (strcklr/resumake#24).
 *
 * Off unless the build sets VITE_UMAMI_SRC and VITE_UMAMI_WEBSITE_ID: then vite.config.ts adds
 * Umami's script tag and lets the CSP reach its origin. Events are names, with a few fixed values
 * (a built-in theme's name, "picker" or "gallery"): never resume text, file names, repo names or the
 * names of a repo's own themes. Umami sends no query string or hash (the GitHub sign-in callback
 * carries a one-time code there), sets no cookies, and honours Do Not Track. See web/README.md.
 */

export interface AnalyticsConfig {
  /** Umami's tracker script, e.g. https://analytics.example.com/script.js */
  src: string;
  websiteId: string;
  /** Only count visits to these hostnames (comma-separated), so local and preview builds aren't counted. */
  domains?: string;
}

export function analyticsConfig(env: Record<string, string | undefined>): AnalyticsConfig | null {
  const src = env.VITE_UMAMI_SRC?.trim();
  const websiteId = env.VITE_UMAMI_WEBSITE_ID?.trim();
  if (!src || !websiteId) return null;
  const url = new URL(src); // throws on a malformed value, failing the build rather than tracking nothing
  if (url.protocol !== 'https:') throw new Error('VITE_UMAMI_SRC must be an https:// URL');
  return { src: url.href, websiteId, domains: env.VITE_UMAMI_DOMAINS?.trim() || undefined };
}

/** The tag vite.config.ts puts in index.html's <head>. */
export function scriptTag(cfg: AnalyticsConfig): string {
  const attrs: Record<string, string> = {
    src: cfg.src,
    'data-website-id': cfg.websiteId,
    'data-do-not-track': 'true',
    'data-exclude-search': 'true',
    'data-exclude-hash': 'true',
  };
  if (cfg.domains) attrs['data-domains'] = cfg.domains;
  const html = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
    .join(' ');
  return `<script defer ${html}></script>`;
}

/** The events the editor sends (see the table in web/README.md). */
export type AnalyticsEvent =
  | 'load-sample'
  | 'open-files'
  | 'open-folder'
  | 'github-sign-in'
  | 'github-repo-template'
  | 'github-open-repo'
  | 'github-save'
  | 'new-file'
  | 'theme-pick'
  | 'accent-pick'
  | 'themes-tab'
  | 'print-pdf'
  | 'download-html'
  | 'download-all';

type EventData = Record<string, string | boolean>;

interface Umami {
  track(event: string, data?: EventData): void;
}

/** Count an event. Does nothing when analytics is off, blocked, or not loaded yet. */
export function track(event: AnalyticsEvent, data?: EventData): void {
  try {
    (globalThis as { umami?: Umami }).umami?.track(event, data);
  } catch {
    /* counting must never break the editor */
  }
}

/** A theme as counted: built-in themes by name, a repo's own themes only as "custom". */
export function themeLabel(theme: { name: string; custom?: boolean }): string {
  return theme.custom ? 'custom' : theme.name;
}
