import { lockedEditorExtensionsFor } from './editorLocksCore.ts'
import { studentTemplate } from './template.ts'

export function lockedEditorExtensions() {
  return lockedEditorExtensionsFor(studentTemplate)
}
