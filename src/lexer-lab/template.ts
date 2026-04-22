import rawTemplate from '../../student-template.hs?raw'
import {
  clampToEditableRange,
  isWithinEditableRange,
  splitTemplate,
  type TemplateParts,
} from './template-shared.ts'

export const studentTemplate = splitTemplate(rawTemplate)

export { clampToEditableRange, isWithinEditableRange, splitTemplate }
export type { TemplateParts }

export function mergeStudentBody(body: string): string {
  return `${studentTemplate.prefix}${body}${studentTemplate.suffix}`
}

export function extractStudentBody(code: string): string | null {
  if (
    !code.startsWith(studentTemplate.prefix) ||
    !code.endsWith(studentTemplate.suffix)
  ) {
    return null
  }
  return code.slice(
    studentTemplate.prefix.length,
    code.length - studentTemplate.suffix.length,
  )
}
