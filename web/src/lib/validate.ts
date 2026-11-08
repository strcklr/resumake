/**
 * Validate resume YAML in the browser against resumake's own schema.
 *
 * `schema.json` is generated from `src/resumake/schema.py` (`resumake schema -o ...`) and compiled
 * into a validator at build time (see vite.config.ts). A Python test fails if the two drift apart,
 * so the editor and the CLI accept the same files.
 * Errors are mapped back to the exact source range using the `yaml` package's node positions.
 */
import type { ErrorObject } from 'ajv';
import check from 'virtual:resume-validator';
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Document, type Node } from 'yaml';

export type Severity = 'error' | 'warning';

export interface Problem {
  severity: Severity;
  /** Character offsets into the source text. */
  from: number;
  to: number;
  /** 1-based, for display. */
  line: number;
  col: number;
  /** Where in the resume, e.g. `work[0].roles[1]`; empty for the whole file. */
  path: string;
  message: string;
}

export interface Result {
  problems: Problem[];
  /** The parsed resume, when the YAML itself parsed. */
  data?: unknown;
}


/** A YAML file parsed with source positions, plus its syntax problems. */
export interface ParsedFile {
  text: string;
  doc: Document;
  lineCounter: LineCounter;
  /** YAML syntax errors and warnings. */
  problems: Problem[];
  /** The parsed value (`{}` for an empty file); undefined when the YAML has errors. */
  data?: unknown;
}

export function parseFile(text: string): ParsedFile {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: false, uniqueKeys: true });
  const file: ParsedFile = { text, doc, lineCounter, problems: [] };
  for (const e of doc.errors) file.problems.push(problemAt(file, 'error', e.pos, '', `YAML: ${firstLine(e.message)}`));
  for (const w of doc.warnings) file.problems.push(problemAt(file, 'warning', w.pos, '', `YAML: ${firstLine(w.message)}`));
  if (!doc.errors.length) file.data = doc.toJS() ?? {};
  return file;
}

export function problemAt(
  file: Pick<ParsedFile, 'lineCounter'>,
  severity: Severity,
  [from, to]: readonly [number, number],
  path: string,
  message: string,
): Problem {
  const { line, col } = file.lineCounter.linePos(from);
  return { severity, from, to: Math.max(to, from), line, col, path, message };
}

/** A schema failure, at a path in the data, worded for people. */
export interface SchemaError {
  segments: Segment[];
  keyword: string;
  message: string;
  /** For an unknown field: the path of the field itself, whose key should be underlined. */
  fieldSegments?: Segment[];
}

export function schemaErrors(data: unknown): SchemaError[] {
  if (check(data)) return [];
  return simplify(check.errors ?? []).map((err) => {
    const segments = pointerToSegments(err.instancePath);
    const extra = err.keyword === 'additionalProperties' ? String(err.params.additionalProperty) : undefined;
    return {
      segments,
      keyword: err.keyword,
      message: describe(err),
      fieldSegments: extra === undefined ? undefined : [...segments, extra],
    };
  });
}

/** Where to underline a schema error inside one file. */
export function locateError(file: ParsedFile, err: SchemaError): [number, number] {
  const loc = err.fieldSegments
    ? locate(file.doc, file.text, err.fieldSegments, true)
    : locate(file.doc, file.text, err.segments);
  return [loc.from, loc.to];
}

export function validate(text: string): Result {
  const file = parseFile(text);
  const problems = [...file.problems];
  if (file.data === undefined) return { problems: sorted(problems) };

  let data = file.data;
  if (!isPlainObject(data)) {
    problems.push(problemAt(file, 'error', [0, lineEnd(text, 0)], '', TOP_LEVEL_MESSAGE));
    return { problems: sorted(problems), data };
  }

  // `extends:` is resolved by the CLI before validation. With a single file in the browser there is
  // nothing to resolve, so check this file on its own and say so.
  if ('extends' in data) {
    const { extends: _ignored, ...rest } = data;
    data = rest;
    const key = locate(file.doc, text, ['extends'], true);
    problems.push(problemAt(file, 'warning', [key.from, key.to], 'extends',
      'extends: is resolved when you build from your GitHub repo; this file is checked on its own, ' +
        'so fields it inherits may be reported as missing'));
  }

  for (const err of schemaErrors(data)) {
    problems.push(problemAt(file, 'error', locateError(file, err), formatPath(err.segments), err.message));
  }
  return { problems: sorted(dedupe(problems)), data };
}

export const TOP_LEVEL_MESSAGE = 'the top level must be a mapping (key: value pairs)';

// --- turning Ajv errors into readable messages -------------------------------------------

type SchemaNode = { type?: string | string[]; items?: SchemaNode; required?: string[]; anyOf?: SchemaNode[] };

/** Collapse `anyOf` failures into one error, like resumake's CLI does, and drop the branch noise. */
function simplify(errors: ErrorObject[]): ErrorObject[] {
  const anyOfPaths = errors.filter((e) => e.keyword === 'anyOf').map((e) => e.schemaPath + '/');
  return errors.filter((e) => !anyOfPaths.some((p) => e.schemaPath.startsWith(p)));
}

function describe(err: ErrorObject): string {
  const p = err.params as Record<string, unknown>;
  switch (err.keyword) {
    case 'required':
      return `'${p.missingProperty}' is required`;
    case 'additionalProperties':
      return `unknown field '${p.additionalProperty}'`;
    case 'type':
      return `must be ${typeName(p.type as string | string[])}`;
    case 'enum':
      return `must be one of: ${(p.allowedValues as unknown[]).join(', ')}`;
    case 'minItems':
      return `needs at least ${p.limit} item${p.limit === 1 ? '' : 's'}`;
    case 'anyOf': {
      const options = ((err.parentSchema as SchemaNode | undefined)?.anyOf ?? []) as SchemaNode[];
      if (options.length && options.every((o) => Object.keys(o).length === 1 && o.required)) {
        return `needs ${options.flatMap((o) => o.required!).map((k) => `'${k}'`).join(' or ')}`;
      }
      return `must be ${options.map((o) => typeName(o.type ?? 'value', o.items)).join(' or ')}`;
    }
    default:
      return err.message ?? 'is invalid';
  }
}

function typeName(type: string | string[], items?: SchemaNode): string {
  const types = Array.isArray(type) ? type : [type];
  // Dates are the only `string | integer` fields in the schema.
  if (types.includes('string') && types.includes('integer')) return 'a date, like 2021, 2021-03 or 2021-03-15';
  const names: Record<string, string> = {
    string: 'text',
    integer: 'a whole number',
    number: 'a number',
    boolean: 'true or false',
    object: 'a mapping (key: value pairs)',
    array: items?.type === 'string' ? 'a list of text' : 'a list',
  };
  return types.map((t) => names[t] ?? t).join(' or ');
}

// --- mapping a path in the data back to the source text ---------------------------------

export type Segment = string | number;

function pointerToSegments(pointer: string): Segment[] {
  if (!pointer) return [];
  return pointer
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s));
}

export function formatPath(segments: Segment[]): string {
  return segments.reduce<string>(
    (out, s) => (typeof s === 'number' ? `${out}[${s}]` : out ? `${out}.${s}` : s),
    '',
  );
}

/**
 * Find the source range to underline for a path. A scalar is underlined itself; a mapping or
 * list is represented by the key that holds it (underlining a whole block is just noise).
 * `keyOnly` underlines the key even for a scalar (for an unknown field, the key is the mistake).
 */
export function locate(doc: Document, text: string, segments: Segment[], keyOnly = false): { from: number; to: number } {
  let node: Node | null = doc.contents as Node | null;
  let keyRange: [number, number] | undefined;
  let valueRange: [number, number] | undefined = rangeOf(node);

  for (const seg of segments) {
    if (isMap(node) && typeof seg === 'string') {
      const pair = node.items.find((it) => isScalar(it.key) && String(it.key.value) === seg);
      if (!pair) break;
      keyRange = rangeOf(pair.key as Node);
      node = (pair.value as Node | null) ?? null;
      valueRange = rangeOf(node);
    } else if (isSeq(node) && typeof seg === 'number') {
      const item = node.items[seg] as Node | undefined;
      if (!item) break;
      node = item;
      valueRange = rangeOf(item);
      keyRange = undefined;
    } else {
      break;
    }
  }

  if (keyOnly && keyRange) return { from: keyRange[0], to: keyRange[1] };
  if (node && isScalar(node) && valueRange) return { from: valueRange[0], to: valueRange[1] };
  if (keyRange) return { from: keyRange[0], to: keyRange[1] };
  // A list item with no key of its own (e.g. `work[2]`): underline its first line.
  if (valueRange) return { from: valueRange[0], to: Math.min(valueRange[1], lineEnd(text, valueRange[0])) };
  return { from: 0, to: 0 };
}

function rangeOf(node: Node | null | undefined): [number, number] | undefined {
  return node?.range ? [node.range[0], node.range[1]] : undefined;
}

// --- small helpers -------------------------------------------------------------------------

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function firstLine(s: string): string {
  return s.split('\n')[0];
}

export function lineEnd(text: string, from: number): number {
  const i = text.indexOf('\n', from);
  return i === -1 ? text.length : i;
}

export function sorted<T extends Problem>(problems: T[]): T[] {
  return problems.sort((a, b) => a.from - b.from || a.message.localeCompare(b.message));
}

export function dedupe<T extends Problem>(problems: T[]): T[] {
  const seen = new Set<string>();
  return problems.filter((p) => {
    const k = `${p.from}:${p.to}:${p.message}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}
