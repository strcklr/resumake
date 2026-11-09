/** CodeMirror 6 set up for resume YAML: highlighting, schema lint and field autocomplete. */
import {
  autocompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { yaml } from '@codemirror/lang-yaml';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { EditorState, type Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { suggest, suggestValue, type Suggestion } from './complete';
import type { ThemeInfo } from './themes';
import type { Problem } from './validate';

export interface EditorOptions {
  parent: HTMLElement;
  dark: boolean;
  /**
   * Check the open file (debounced by the linter) and return the problems to underline in it.
   * Problems in other files belong in the page's list, not here.
   */
  check: (text: string) => Problem[];
  /** The themes `layout.theme` can name, for its suggestions (built-in and the repo's own). */
  themes?: () => ThemeInfo[];
}

/** One editor view; each open file has its own state (text, undo history, selection). */
export interface Editor {
  view: EditorView;
  /** A fresh state for a file's text, to show with `view.setState`. */
  stateFor: (text: string) => EditorState;
}

function fieldCompletions(ctx: CompletionContext, themes?: () => ThemeInfo[]): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  const lines: string[] = [];
  for (let n = 1; n < line.number; n++) lines.push(ctx.state.doc.line(n).text);
  lines.push(before);
  for (let n = line.number + 1; n <= ctx.state.doc.lines; n++) lines.push(ctx.state.doc.line(n).text);

  // A value after `key: `, e.g. `theme: mod` or `accent: "#0f`.
  const value = suggestValue(lines, line.number - 1, themes?.());
  if (value) {
    return {
      from: line.from + value.start,
      options: value.options.map((o) => ({ label: o.label, detail: o.detail, apply: o.apply, type: 'enum' })),
      validFor: /^["#\w-]*$/,
    };
  }

  const options = suggest(lines, line.number - 1);
  if (!options?.length) return null;
  const word = /[\w-]*$/.exec(before)![0];
  if (!word && !ctx.explicit && !/(^\s*-\s|^\s+)$/.test(before)) return null;
  return { from: ctx.pos - word.length, options: options.map(fieldOption), validFor: /^[\w-]*$/ };
}

/** A field name; for one with suggested values (`theme: `), the suggestions reopen for its value. */
function fieldOption(o: Suggestion): Completion {
  const option: Completion = { label: o.label, detail: o.detail, apply: o.apply, type: 'property' };
  if (o.hasValues) {
    option.apply = (view, _completion, from, to) => {
      view.dispatch({ changes: { from, to, insert: o.apply }, selection: { anchor: from + o.apply.length } });
      startCompletion(view);
    };
  }
  return option;
}

export function createEditor(opts: EditorOptions): Editor {
  const resumeLint = linter(
    (view): Diagnostic[] =>
      opts.check(view.state.doc.toString()).map((p) => ({
        from: p.from,
        to: p.to,
        severity: p.severity,
        message: p.path ? `${p.path}: ${p.message}` : p.message,
      })),
    { delay: 250 },
  );

  const extensions: Extension[] = [
    basicSetup,
    keymap.of([indentWithTab]),
    yaml(),
    EditorState.tabSize.of(2),
    lintGutter(),
    resumeLint,
    autocompletion({ override: [(ctx) => fieldCompletions(ctx, opts.themes)], activateOnTyping: true }),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ 'aria-label': 'Resume YAML' }),
  ];
  if (opts.dark) extensions.push(oneDark);

  const stateFor = (text: string) => EditorState.create({ doc: text, extensions });
  return { view: new EditorView({ parent: opts.parent, state: stateFor('') }), stateFor };
}

export function replaceDoc(view: EditorView, text: string): void {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
}

export function jumpTo(view: EditorView, from: number, to: number): void {
  view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
  view.focus();
}
