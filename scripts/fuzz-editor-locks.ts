import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { EditorSelection, EditorState } from '@codemirror/state'
import { lockedEditorExtensionsFor } from '../src/lexer-lab/editorLocksCore.ts'
import { splitTemplate } from '../src/lexer-lab/template-shared.ts'

const templatePath = fileURLToPath(
  new URL('../student-template.hs', import.meta.url),
)
const template = splitTemplate(readFileSync(templatePath, 'utf8'))

const INSERT_CHARS = [' ', '\n', '1', '2', '+', '*', '(', ')', 'x']

function randInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive)
}

function randomInsert(): string {
  const length = randInt(4)
  return Array.from({ length }, () => INSERT_CHARS[randInt(INSERT_CHARS.length)]).join(
    '',
  )
}

for (let seq = 0; seq < 1000; seq += 1) {
  let state = EditorState.create({
    doc: template.full,
    extensions: [...lockedEditorExtensionsFor(template)],
  })

  for (let step = 0; step < 30; step += 1) {
    const docLength = state.doc.length
    const from = randInt(docLength + 1)
    const to = from + randInt(Math.min(5, docLength - from) + 1)

    const tx = state.update({
      changes: { from, to, insert: randomInsert() },
    })
    state = tx.state

    const nextLength = state.doc.length
    const anchor = randInt(nextLength + 1)
    const head = randInt(nextLength + 1)
    state = state.update({
      selection: EditorSelection.range(anchor, head),
    }).state

    const text = state.doc.toString()
    assert.equal(
      text.slice(0, template.prefix.length),
      template.prefix,
      `prefix mutated in sequence ${seq}, step ${step}`,
    )
    assert.equal(
      text.slice(text.length - template.suffix.length),
      template.suffix,
      `suffix mutated in sequence ${seq}, step ${step}`,
    )
  }
}

console.log('fuzz-editor-locks: 1000 random edit sequences passed')
