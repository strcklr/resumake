/**
 * Several resume files at once: resolve `extends:` the way the CLI does, validate the merged
 * result, and map every problem back to the file and line that caused it.
 *
 * The merge is a port of `deep_merge` / `_load` in `src/resumake/loader.py`. Both are checked
 * against the shared cases in `tests/fixtures/extends/`, so a change to the rules has to land in
 * both. Alongside the merged data it builds an `Origin` tree recording which file supplied each
 * value, which is how an error in the merged resume finds its way back to a line in one file.
 *
 * The page keeps its files in the browser for now (`files.ts`); GitHub sync (#5) will supply them instead.
 */
import {
  dedupe,
  formatPath,
  isPlainObject,
  lineEnd,
  locate,
  locateError,
  parseFile,
  problemAt,
  schemaErrors,
  sorted,
  TOP_LEVEL_MESSAGE,
  type ParsedFile,
  type Problem,
  type Segment,
  type Severity,
} from './validate';

/** Workspace files by path: relative, `/`-separated, e.g. `resumes/tailored/acme.yml`. */
export type Files = Record<string, string>;

export interface FileProblem extends Problem {
  /** The file the problem is in, which may be a parent of the one being checked. */
  file: string;
}

/** Which file supplied a value. Mappings record their keys' origins; lists and scalars come whole from one file. */
export interface Origin {
  file: string;
  keys?: Record<string, Origin>;
}

export interface Resolved {
  /** The file that was resolved. */
  entry: string;
  /** The merged resume with `extends` removed, as the CLI would validate it. Undefined if the chain is broken. */
  data?: Record<string, unknown>;
  origin?: Origin;
  /** Problems in the entry and in any file it extends. */
  problems: FileProblem[];
  /** Every file the entry reads, itself included. */
  files: string[];
}

type Annotated = { value: unknown; origin: Origin };

export class Workspace {
  private parsed = new Map<string, ParsedFile>();

  constructor(private readonly files: Files) {}

  /** Resolve and validate one file. Shared fragments (a path part starting with `_`) skip schema checks, as in the CLI. */
  resolve(entry: string): Resolved {
    const problems: FileProblem[] = [];
    const used = new Set<string>();
    const loaded = this.load(entry, [], problems, used);
    const result: Resolved = { entry, problems, files: [...used] };
    if (!loaded) return finish(result);

    result.data = loaded.value as Record<string, unknown>;
    result.origin = loaded.origin;
    if (!isPartial(entry)) {
      for (const err of schemaErrors(result.data)) {
        // An unknown field is reported where it's written; anything else where its value comes from.
        const file = originFile(loaded.origin, err.fieldSegments ?? err.segments);
        const parsed = this.parse(file)!;
        problems.push({ ...problemAt(parsed, 'error', locateError(parsed, err), formatPath(err.segments), err.message), file });
      }
    }
    return finish(result);
  }

  /** Where `segments` is written in `file` (the key that holds it), to jump there. */
  range(file: string, segments: Segment[]): [number, number] | undefined {
    const parsed = this.parse(file);
    if (!parsed) return undefined;
    const loc = locate(parsed.doc, parsed.text, segments, true);
    return [loc.from, loc.to];
  }

  private parse(path: string): ParsedFile | undefined {
    if (!(path in this.files)) return undefined;
    let parsed = this.parsed.get(path);
    if (!parsed) this.parsed.set(path, (parsed = parseFile(this.files[path])));
    return parsed;
  }

  /** Load one file and everything it extends. Returns undefined (with problems recorded) if anything is broken. */
  private load(path: string, stack: string[], problems: FileProblem[], used: Set<string>): Annotated | undefined {
    used.add(path);
    const file = this.parse(path)!;
    const report = (severity: Severity, range: readonly [number, number], at: string, message: string) =>
      problems.push({ ...problemAt(file, severity, range, at, message), file: path });

    problems.push(...file.problems.map((p) => ({ ...p, file: path })));
    if (file.data === undefined) return undefined;
    if (!isPlainObject(file.data)) {
      report('error', [0, lineEnd(file.text, 0)], '', TOP_LEVEL_MESSAGE);
      return undefined;
    }

    const { extends: parents, ...own } = file.data;
    const self: Annotated = { value: own, origin: originOf(own, path) };
    if (!parents) return self;

    const refs = typeof parents === 'string' ? [parents] : parents;
    if (!Array.isArray(refs) || !refs.every((r) => typeof r === 'string')) {
      report('error', extendsRange(file, null), 'extends', 'extends must be a file path or a list of file paths');
      return undefined;
    }

    // Like the CLI: start from {}, merge each parent left to right, then this file on top.
    let base: Annotated = { value: {}, origin: { file: path } };
    let broken = false;
    refs.forEach((ref, i) => {
      const range = extendsRange(file, typeof parents === 'string' ? null : i);
      const target = resolvePath(path, ref);
      if (target === undefined || !(target in this.files)) {
        report('error', range, 'extends', `can't find ${ref}`);
        broken = true;
      } else if (target === path || stack.includes(target)) {
        const cycle = [...stack, path, target].slice([...stack, path].indexOf(target));
        report('error', range, 'extends', `circular extends: ${cycle.join(' → ')}`);
        broken = true;
      } else {
        const parent = this.load(target, [...stack, path], problems, used);
        if (parent) base = merge(base, parent);
        else {
          report('error', range, 'extends', `can't use ${ref} until its problems are fixed`);
          broken = true;
        }
      }
    });
    return broken ? undefined : merge(base, self);
  }
}

// --- the merge (port of resumake.loader.deep_merge) ---------------------------------------

/**
 * Mappings merge key by key; anything else in `over` replaces the base value; a key set to null in
 * `over` is removed. Note the CLI starts from {} and merges each parent in, so a parent's own
 * top-level nulls are dropped too, while its nested nulls are kept (see tests/fixtures/extends/parent-nulls).
 */
function merge(base: Annotated, over: Annotated): Annotated {
  if (!isPlainObject(base.value) || !isPlainObject(over.value)) return over;
  const value: Record<string, unknown> = { ...base.value };
  const keys: Record<string, Origin> = { ...base.origin.keys };
  for (const [key, v] of Object.entries(over.value)) {
    const vOrigin = over.origin.keys![key];
    if (v === null) {
      delete value[key];
      delete keys[key];
    } else if (key in value) {
      const merged = merge({ value: value[key], origin: keys[key] ?? { file: base.origin.file } }, { value: v, origin: vOrigin });
      value[key] = merged.value;
      keys[key] = merged.origin;
    } else {
      value[key] = v;
      keys[key] = vOrigin;
    }
  }
  return { value, origin: { file: over.origin.file, keys } };
}

function originOf(value: unknown, file: string): Origin {
  if (!isPlainObject(value)) return { file };
  return { file, keys: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, originOf(v, file)])) };
}

/** The file that supplied the value at `segments` (the nearest recorded ancestor for anything deeper). */
export function originFile(origin: Origin, segments: Segment[]): string {
  let node = origin;
  for (const seg of segments) {
    const next = typeof seg === 'string' ? node.keys?.[seg] : undefined;
    if (!next) break;
    node = next;
  }
  return node.file;
}

export interface Inherited {
  segments: Segment[];
  file: string;
}

/**
 * The parts of a resolved resume that come from other files, as compactly as possible: a section
 * inherited whole is listed once (`work`), not field by field.
 */
export function inheritedFields(origin: Origin, entry: string): Inherited[] {
  const out: Inherited[] = [];
  const allFrom = (node: Origin, file: string): boolean =>
    node.file === file && Object.values(node.keys ?? {}).every((child) => allFrom(child, file));
  const walk = (node: Origin, segments: string[]) => {
    if (segments.length && node.file !== entry && allFrom(node, node.file)) {
      out.push({ segments, file: node.file });
      return;
    }
    for (const [key, child] of Object.entries(node.keys ?? {})) walk(child, [...segments, key]);
  };
  walk(origin, []);
  return out;
}

// --- paths ---------------------------------------------------------------------------------

/** `ref` relative to the folder of `from`, like the CLI's `(path.parent / ref).resolve()`. Undefined if it leaves the workspace. */
export function resolvePath(from: string, ref: string): string | undefined {
  if (ref.startsWith('/')) return undefined;
  const parts = from.split('/').slice(0, -1);
  for (const part of ref.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return undefined;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}

/** Files or folders starting with `_` are shared fragments: extended by others, not built on their own. */
export function isPartial(path: string): boolean {
  return path.split('/').some((part) => part.startsWith('_'));
}

function extendsRange(file: ParsedFile, index: number | null): [number, number] {
  const loc = locate(file.doc, file.text, index === null ? ['extends'] : ['extends', index]);
  return [loc.from, loc.to];
}

function finish(result: Resolved): Resolved {
  result.problems = sorted(dedupeAcrossFiles(result.problems)).sort(
    (a, b) => Number(a.file !== result.entry) - Number(b.file !== result.entry) || a.file.localeCompare(b.file),
  );
  return result;
}

function dedupeAcrossFiles(problems: FileProblem[]): FileProblem[] {
  const byFile = new Map<string, FileProblem[]>();
  for (const p of problems) byFile.set(p.file, [...(byFile.get(p.file) ?? []), p]);
  return [...byFile.values()].flatMap((list) => dedupe(list));
}
