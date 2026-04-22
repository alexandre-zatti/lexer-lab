import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { lockedEditorExtensionsFor } from './editorLocksCore'
import { mergeStudentBody, studentTemplate } from './template'

function createState(body = studentTemplate.body) {
  return EditorState.create({
    doc: mergeStudentBody(body),
    extensions: [...lockedEditorExtensionsFor(studentTemplate)],
  })
}

describe('locked editor extensions', () => {
  it('blocks edits that mutate the protected wrapper', () => {
    const state = createState()
    const nextState = state.update({
      changes: { from: 0, to: 0, insert: 'x' },
    }).state

    expect(nextState.doc.toString()).toBe(state.doc.toString())
  })

  it('allows replacing the whole document when the wrapper still matches', () => {
    const state = createState()
    const replacementBody = `${studentTemplate.body}lexer [] = []\n`
    const replacementDoc = mergeStudentBody(replacementBody)

    const nextState = state.update({
      changes: { from: 0, to: state.doc.length, insert: replacementDoc },
    }).state

    expect(nextState.doc.toString()).toBe(replacementDoc)
  })

  it('allows selecting the full template for copying', () => {
    const state = createState()
    const nextState = state.update({
      selection: EditorSelection.range(0, state.doc.length),
    }).state

    expect(nextState.selection.main.from).toBe(0)
    expect(nextState.selection.main.to).toBe(state.doc.length)
  })
})
