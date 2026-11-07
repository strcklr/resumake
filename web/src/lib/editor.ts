/** CodeMirror 6 set up for resume YAML: highlighting, schema lint and field autocomplete. */
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { yaml } from '@codemirror/lang-yaml';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { EditorState, type Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { suggest } from './complete';
import { validate, type Problem } from './validate';

export interface EditorOptions {
  parent: HTMLElement;
  doc: string;
  dark: boolean;
  /** Called after each change is validated (debounced by the linter). */
  onValidated: (text: string, problems: Problem[]) => void;
}

function fieldCompletions(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  const lines: string[] = [];
  for (let n = 1; n < line.number; n++) lines.push(ctx.state.doc.line(n).text);
  lines.push(before);
  for (let n = line.number + 1; n <= ctx.state.doc.lines; n++) lines.push(ctx.state.doc.line(n).text);

  const options = suggest(lines, line.number - 1);
  if (!options?.length) return null;
  const word = /[\w-]*$/.exec(before)![0];
  if (!word && !ctx.explicit && !/(^\s*-\s|^\s+)$/.test(before)) return null;
  return {
    from: ctx.pos - word.length,
    options: options.map((o) => ({ label: o.label, detail: o.detail, apply: o.apply, type: 'property' })),
    validFor: /^[\w-]*$/,
  };
}

export function createEditor(opts: EditorOptions): EditorView {
  const resumeLint = linter(
    (view): Diagnostic[] => {
      const text = view.state.doc.toString();
      const { problems } = validate(text);
      opts.onValidated(text, problems);
      return problems.map((p) => ({
        from: p.from,
        to: p.to,
        severity: p.severity,
        message: p.path ? `${p.path}: ${p.message}` : p.message,
      }));
    },
    { delay: 250 },
  );

  const extensions: Extension[] = [
    basicSetup,
    keymap.of([indentWithTab]),
    yaml(),
    EditorState.tabSize.of(2),
    lintGutter(),
    resumeLint,
    autocompletion({ override: [fieldCompletions], activateOnTyping: true }),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ 'aria-label': 'Resume YAML' }),
  ];
  if (opts.dark) extensions.push(oneDark);

  return new EditorView({ parent: opts.parent, doc: opts.doc, extensions });
}

export function replaceDoc(view: EditorView, text: string): void {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
}

export function jumpTo(view: EditorView, from: number, to: number): void {
  view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
  view.focus();
}
