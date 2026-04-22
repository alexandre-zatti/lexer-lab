import {
  EditorSelection,
  EditorState,
  type Extension,
  type TransactionSpec,
} from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import {
  clampToEditableRange,
  isWithinEditableRange,
  type TemplateParts,
} from './template-shared.ts'

const lockedMark = Decoration.mark({ class: 'cm-locked-region' })

export function lockedEditorExtensionsFor(
  template: TemplateParts,
): Extension[] {
  return [
    EditorState.transactionFilter.of((tr): TransactionSpec | readonly TransactionSpec[] => {
      if (!tr.docChanged && !tr.selection) {
        return []
      }

      const editableFrom = template.editableFrom
      const editableTo = tr.startState.doc.length - template.suffix.length

      if (tr.docChanged) {
        let valid = true
        tr.changes.iterChangedRanges((fromA, toA) => {
          if (!isWithinEditableRange(fromA, toA, editableFrom, editableTo)) {
            valid = false
          }
        })
        if (!valid) {
          return []
        }
      }

      if (!tr.selection) {
        return tr
      }

      const clamped = tr.startState.changeByRange((range) => {
        const anchor = clampToEditableRange(
          range.anchor,
          editableFrom,
          editableTo,
        )
        const head = clampToEditableRange(range.head, editableFrom, editableTo)
        return { range: EditorSelection.range(anchor, head) }
      })

      return [tr, { selection: clamped.selection }]
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
