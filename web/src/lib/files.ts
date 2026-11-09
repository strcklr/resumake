/**
 * The editor's files: a small workspace kept in this browser, so a base resume and tailored
 * variants that `extends:` it can be edited together. GitHub sync (#5) will replace the browser as
 * the place these live; the shape stays the same.
 *
 * Storage can be unavailable (private windows, blocked site data), so every access is guarded and
 * the editor works without it.
 */
import { strToU8, zipSync } from 'fflate';
import sampleBase from '../../../resumes/default.yml?raw';
import sampleTailored from '../../../resumes/tailored/example-platform.yml?raw';
import type { Files } from './workspace';

export interface Saved {
  files: Files;
  active: string;
  /** Files open as tabs, in tab order. Closing a tab keeps the file. */
  tabs: string[];
  /** The GitHub repo the files were opened from, if any. */
  source?: Source | null;
}

export interface Source {
  repo: string;
  /** The repo's default branch, where pull requests go. */
  defaultBranch: string;
  branch: string;
  /** The commit the files were read from. */
  commit: string;
  /** The repo folder the workspace's paths are relative to. */
  folder: string;
  /** The files as they are at `commit`, to work out what changed. Missing for files opened before saving existed. */
  base?: Files;
}

const KEY = 'resumake:workspace';
/** Where the single-file editor kept its draft, before workspaces. */
const OLD_DRAFT_KEY = 'resumake:draft';

export const BASE_FILE = 'default.yml';

export function sampleWorkspace(): Saved {
  const files = { [BASE_FILE]: sampleBase, 'tailored/example-platform.yml': sampleTailored };
  return { files, active: BASE_FILE, tabs: sortPaths(Object.keys(files)) };
}

export function loadWorkspace(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Saved>;
      if (saved.files && Object.keys(saved.files).length) {
        const paths = sortPaths(Object.keys(saved.files));
        const active = saved.active && saved.active in saved.files ? saved.active : paths[0];
        const tabs = (saved.tabs ?? paths).filter((t) => t in saved.files!);
        return { files: saved.files, active, tabs: tabs.includes(active) ? tabs : [...tabs, active], source: saved.source ?? null };
      }
    }
    const draft = localStorage.getItem(OLD_DRAFT_KEY);
    if (draft) return { files: { [BASE_FILE]: draft }, active: BASE_FILE, tabs: [BASE_FILE] };
  } catch {
    /* fall through to the sample */
  }
  return sampleWorkspace();
}

export function saveWorkspace(saved: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* not persisted; nothing else to do */
  }
}

/** Base files first, then folders, alphabetically: `default.yml`, `_shared/…`, `tailored/…`. */
export function sortPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) => {
    const depth = a.split('/').length - b.split('/').length;
    return depth || a.localeCompare(b);
  });
}

/** Why a path can't be used as a file name, or null if it can. */
export function invalidName(path: string, existing: Files, current?: string): string | null {
  if (!path) return 'Enter a file name.';
  if (!/\.ya?ml$/i.test(path)) return 'The name must end in .yml or .yaml.';
  if (path.startsWith('/') || path.split('/').some((p) => p === '' || p === '.' || p === '..')) {
    return 'Use a path inside the workspace, like tailored/acme.yml.';
  }
  if (path !== current && path in existing) return `${path} already exists.`;
  return null;
}

/** `to` relative to the folder of `from`, as an `extends:` value. */
export function relativePath(from: string, to: string): string {
  const fromDir = from.split('/').slice(0, -1);
  const target = to.split('/');
  let shared = 0;
  while (shared < fromDir.length && shared < target.length - 1 && fromDir[shared] === target[shared]) shared++;
  return [...Array(fromDir.length - shared).fill('..'), ...target.slice(shared)].join('/');
}

/** Starting content for a new tailored file that extends `base`. */
export function newVariant(path: string, base: string | undefined): string {
  if (!base) return 'basics:\n  name: \n';
  return `# A tailored version of ${base}: it inherits everything and changes only what you add here.
extends: ${relativePath(path, base)}

# For example:
# basics:
#   label: Backend Engineer
`;
}

/** Turn picked files (or a picked folder) into workspace files. Folder picks drop the folder's own name. */
export async function readPicked(list: FileList): Promise<Files> {
  const files: Files = {};
  for (const file of Array.from(list)) {
    if (!/\.ya?ml$/i.test(file.name)) continue;
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const parts = rel.split('/');
    files[parts.length > 1 ? parts.slice(1).join('/') : rel] = await file.text();
  }
  return files;
}

export function zipFiles(files: Files): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([path, text]) => [path, strToU8(text)])));
}

export function download(filename: string, data: string | Uint8Array, type = 'text/yaml'): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

/** The CLI's output name for a file: `tailored/acme.yml` → `tailored-acme`. */
export function outputName(path: string): string {
  return path.replace(/\.ya?ml$/i, '').split('/').join('-');
}

/** The tab to show after closing `closing`: the one to its right, else to its left. */
export function neighbor(tabs: string[], closing: string): string | undefined {
  const i = tabs.indexOf(closing);
  return tabs[i + 1] ?? tabs[i - 1];
}
