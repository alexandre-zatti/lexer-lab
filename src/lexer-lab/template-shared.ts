export const STUDENT_BEGIN_MARKER = '-- [STUDENT-BEGIN]'
export const STUDENT_END_MARKER = '-- [STUDENT-END]'

export interface TemplateParts {
  full: string
  prefix: string
  body: string
  suffix: string
  editableFrom: number
  editableTo: number
}

function fail(message: string): never {
  throw new Error(`student template invariant failed: ${message}`)
}

export function splitTemplate(template: string): TemplateParts {
  const begin = template.indexOf(STUDENT_BEGIN_MARKER)
  const end = template.indexOf(STUDENT_END_MARKER)
  if (begin < 0 || end < 0 || begin >= end) {
    fail('missing sentinel markers')
  }

  const bodyStart = template.indexOf('\n', begin)
  if (bodyStart < 0) fail('begin marker must end with newline')
  const editableFrom = bodyStart + 1
  const editableTo = end

  return {
    full: template,
    prefix: template.slice(0, editableFrom),
    body: template.slice(editableFrom, editableTo),
    suffix: template.slice(editableTo),
    editableFrom,
    editableTo,
  }
}

export function isWithinEditableRange(
  from: number,
  to: number,
  editableFrom: number,
  editableTo: number,
): boolean {
  return from >= editableFrom && to <= editableTo
}

export function clampToEditableRange(
  pos: number,
  editableFrom: number,
  editableTo: number,
): number {
  if (pos < editableFrom) return editableFrom
  if (pos > editableTo) return editableTo
  return pos
}
