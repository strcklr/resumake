/**
 * The no-account draft: kept in this browser only. Storage can be unavailable (private windows,
 * blocked site data), so every access is guarded and the editor works without it.
 */
const KEY = 'resumake:draft';

export function loadDraft(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveDraft(text: string): void {
  try {
    localStorage.setItem(KEY, text);
  } catch {
    /* not persisted; nothing else to do */
  }
}

export function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/yaml' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
