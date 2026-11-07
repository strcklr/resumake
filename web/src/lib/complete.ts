/**
 * Autocomplete for resume fields, driven by the same schema.json used for validation.
 *
 * Works line by line from indentation, so it keeps working while the document is half-typed
 * and wouldn't parse: the parent of a key is the nearest line above with a smaller indent.
 */
import schema from './schema.json';

interface SchemaNode {
  type?: string | string[];
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  enum?: string[];
  required?: string[];
}

export interface Suggestion {
  label: string;
  /** What the field holds, e.g. "text", "list", "date". */
  detail: string;
  /** Text to insert: `name: ` for a field, the bare value for an enum. */
  apply: string;
}

const ROOT = schema as SchemaNode;
const KEY_LINE = /^(\s*)(- )?([A-Za-z_][\w-]*)\s*:/;

/** The text being completed: a key at the start of a line (after any `- `), up to the cursor. */
export function completionContext(lineText: string): { indent: number; dash: boolean; word: string } | null {
  const m = /^(\s*)(- )?([A-Za-z_][\w-]*)?$/.exec(lineText);
  if (!m) return null;
  return { indent: m[1].length + (m[2] ? 2 : 0), dash: Boolean(m[2]), word: m[3] ?? '' };
}

/**
 * Suggestions for the cursor at the end of `lines[lineIndex]` (which holds the text up to the cursor).
 * Returns null when the cursor isn't in a place where a field name or enum value goes.
 */
export function suggest(lines: string[], lineIndex: number): Suggestion[] | null {
  const ctx = completionContext(lines[lineIndex]);
  if (!ctx) return null;

  // Walk up to collect the chain of parent keys.
  const path: string[] = [];
  let indent = ctx.indent;
  for (let i = lineIndex - 1; i >= 0 && indent > 0; i--) {
    const m = KEY_LINE.exec(lines[i]);
    if (!m) continue;
    const keyIndent = m[1].length + (m[2] ? 2 : 0);
    if (keyIndent < indent) {
      path.unshift(m[3]);
      indent = keyIndent;
    }
  }

  let node: SchemaNode | undefined = ROOT;
  for (const key of path) {
    node = descend(node)?.properties?.[key];
    if (!node) return [];
  }
  const target = descend(node);
  if (!target) return [];

  if (target.enum) {
    return ctx.dash ? target.enum.map((v) => ({ label: v, detail: 'section', apply: v })) : [];
  }
  const siblings = new Set(siblingKeys(lines, lineIndex, ctx.indent));
  return Object.entries(target.properties ?? {})
    .filter(([key]) => !siblings.has(key))
    .map(([key, child]) => ({
      label: key,
      detail: (target.required?.includes(key) ? 'required · ' : '') + kind(child),
      apply: `${key}: `,
    }));
}

/** Lists are transparent: a key under `work:` belongs to a work entry. */
function descend(node: SchemaNode | undefined): SchemaNode | undefined {
  return node && isArray(node) ? node.items : node;
}

function isArray(node: SchemaNode): boolean {
  return node.type === 'array' || (Array.isArray(node.type) && node.type.includes('array'));
}

function kind(node: SchemaNode): string {
  const t = Array.isArray(node.type) ? node.type : [node.type];
  if (t.includes('string') && t.includes('integer')) return 'date';
  if (t.includes('array')) return 'list';
  if (t.includes('object')) return 'mapping';
  if (node.enum) return 'choice';
  return 'text';
}

/** Keys already present in the same mapping, so they aren't suggested twice. */
function siblingKeys(lines: string[], lineIndex: number, indent: number): string[] {
  const keys: string[] = [];
  const scan = (from: number, step: number) => {
    for (let i = from; i >= 0 && i < lines.length; i += step) {
      const m = KEY_LINE.exec(lines[i]);
      if (!m) {
        if (lines[i].trim() && !lines[i].trim().startsWith('#') && leading(lines[i]) < indent) return;
        continue;
      }
      const keyIndent = m[1].length + (m[2] ? 2 : 0);
      if (keyIndent < indent) return;
      if (keyIndent === indent) {
        // A `- ` line starts a list item: going up it's the start of ours (include it, then
        // stop); going down it's the next item's.
        if (m[2] && step > 0) return;
        keys.push(m[3]);
        if (m[2]) return;
      }
    }
  };
  const current = completionContext(lines[lineIndex]);
  if (!current?.dash) scan(lineIndex - 1, -1);
  scan(lineIndex + 1, 1);
  return keys;
}

function leading(line: string): number {
  return line.length - line.trimStart().length;
}
