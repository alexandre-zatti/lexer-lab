export const REQUIRED_SIGNATURE = 'lexer :: String -> [Token]'

const REQUIRED_SIGNATURE_LINE =
  /^\s*lexer\s*::\s*String\s*->\s*\[\s*Token\s*\]\s*$/

export function hasRequiredSignature(code: string): boolean {
  return code.split(/\r?\n/).some((line) => REQUIRED_SIGNATURE_LINE.test(line))
}
