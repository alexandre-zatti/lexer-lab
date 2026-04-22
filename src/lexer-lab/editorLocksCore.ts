import { EditorState, type Extension, type TransactionSpec } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import { type TemplateParts } from './template-shared.ts'

const lockedMark = Decoration.mark({ class: 'cm-locked-region' })

export function lockedEditorExtensionsFor(
  template: TemplateParts,
): Extension[] {
  return [
    EditorState.transactionFilter.of((tr): TransactionSpec | readonly TransactionSpec[] => {
      if (!tr.docChanged) return tr
      const nextDoc = tr.newDoc.toString()
      return nextDoc.startsWith(template.prefix) && nextDoc.endsWith(template.suffix)
        ? tr
        : []
    }),
    EditorView.decorations.of((view) =>
      Decoration.set([
        lockedMark.range(0, template.editableFrom),
        lockedMark.range(
          view.state.doc.length - template.suffix.length,
          view.state.doc.length,
        ),
      ]),
    ),
    EditorView.theme({
      '.cm-locked-region': {
        backgroundColor: 'rgba(255, 255, 255, 0.018)',
        color: 'var(--fg-3)',
        opacity: '0.78',
      },
    }),
  ]
}
