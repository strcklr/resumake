/**
 * Set or remove one `layout:` field (theme, accent) in a resume's YAML, as a small text edit:
 * comments, ordering and formatting elsewhere in the file are left alone, and the change goes
 * into the editor's undo history like typing would.
 */
import { isMap, isScalar, parseDocument, type Document, type Pair, type YAMLMap } from 'yaml';

export type LayoutKey = 'theme' | 'accent';

/** A text edit: replace `from`..`to` with `insert`. */
export interface Change {
  from: number;
  to: number;
  insert: string;
}

/** True when the text isn't valid YAML, so it can't be edited safely. */
export function hasSyntaxErrors(text: string): boolean {
  return parseDocument(text).errors.length > 0;
}

/** The value this file itself sets for `layout.<key>` (not what it inherits), if any. */
export function ownLayoutField(text: string, key: LayoutKey): string | undefined {
  const doc = parseDocument(text);
  const value = doc.getIn(['layout', key]);
  return typeof value === 'string' ? value : undefined;
}

/**
 * The edit that sets `layout.<key>` to `value` in `text`, or removes it when `value` is null.
 * Returns null when nothing would change, or when the YAML has syntax errors (fix those first).
 */
export function setLayoutField(text: string, key: LayoutKey, value: string | null): Change | null {
  const doc = parseDocument(text);
  if (doc.errors.length) return null;
  const formatted = value === null ? null : format(key, value);

  const root = doc.contents;
  if (root !== null && !isMap(root)) return null; // not a resume: leave it to the validator
  const layoutPair = root ? findPair(root, 'layout') : undefined;

  if (!layoutPair) {
    if (formatted === null) return null;
    // A new `layout:` block at the end of the file.
    const lead = !text.length || text.endsWith('\n') ? '' : '\n';
    const gap = text.trim() ? (text.endsWith('\n\n') ? '' : '\n') : '';
    return { from: text.length, to: text.length, insert: `${lead}${gap}layout:\n  ${key}: ${formatted}\n` };
  }

  const layout = layoutPair.value;
  if (!isMap(layout) || layout.flow || !layout.items.length) return rewrite(doc, text, key, value);
  const pair = findPair(layout, key);

  if (pair) {
    if (formatted === null) {
      // Remove the field's line; remove `layout:` too if that was its only field.
      const only = layout.items.length === 1;
      const start = only ? layoutPair.key : pair.key;
      if (!isScalar(start) || !start.range || !pair.value || !hasRange(pair.value)) return rewrite(doc, text, key, value);
      const from = lineStart(text, start.range[0]);
      const to = lineEndInclusive(text, pair.value.range[1]);
      return { from, to, insert: '' };
    }
    if (isScalar(pair.value) && pair.value.range) {
      const [from, to] = pair.value.range;
      if (text.slice(from, to) === formatted) return null;
      return { from, to, insert: formatted };
    }
    return rewrite(doc, text, key, value);
  }

  if (formatted === null) return null;
  // Add the field after layout's last field, at the same indent as the first.
  const first = layout.items[0].key;
  const last = layout.items[layout.items.length - 1];
  const lastEnd = last.value && hasRange(last.value) ? last.value.range[1] : isScalar(last.key) ? last.key.range?.[1] : undefined;
  if (!isScalar(first) || !first.range || lastEnd === undefined) return rewrite(doc, text, key, value);
  const indent = first.range[0] - lineStart(text, first.range[0]);
  const at = lineEndInclusive(text, lastEnd);
  const lead = at > 0 && text[at - 1] !== '\n' ? '\n' : '';
  return { from: at, to: at, insert: `${lead}${' '.repeat(indent)}${key}: ${formatted}\n` };
}

/** Apply a change to text (for tests and for callers without an editor). */
export function applyChange(text: string, change: Change | null): string {
  return change ? text.slice(0, change.from) + change.insert + text.slice(change.to) : text;
}

/** Colours are quoted: in YAML, an unquoted `#` starts a comment. */
function format(key: LayoutKey, value: string): string {
  return key === 'accent' ? JSON.stringify(value) : value;
}

function findPair(map: YAMLMap, key: string): Pair | undefined {
  return map.items.find((p) => (isScalar(p.key) ? p.key.value === key : p.key === key));
}

function hasRange(node: unknown): node is { range: [number, number, number] } {
  return Array.isArray((node as { range?: unknown }).range);
}

/** Layouts written in an unusual shape (flow style, empty): fall back to re-serializing the file. */
function rewrite(doc: Document, text: string, key: LayoutKey, value: string | null): Change | null {
  if (value === null) {
    if (!doc.hasIn(['layout', key])) return null;
    doc.deleteIn(['layout', key]);
  } else {
    if (!isMap(doc.get('layout'))) doc.set('layout', doc.createNode({}));
    doc.setIn(['layout', key], value);
  }
  const next = String(doc);
  return next === text ? null : { from: 0, to: text.length, insert: next };
}

function lineStart(text: string, pos: number): number {
  return text.lastIndexOf('\n', pos - 1) + 1;
}

/** The position just after the newline ending the line that `pos` is on (or the end of the text). */
function lineEndInclusive(text: string, pos: number): number {
  // A node's end can sit at the start of the next line; step back onto its own line.
  const at = pos > 0 && text[pos - 1] === '\n' ? pos - 1 : pos;
  const nl = text.indexOf('\n', at);
  return nl === -1 ? text.length : nl + 1;
}
