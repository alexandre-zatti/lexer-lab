import type { Token } from './types'

const SENT_BEG = '---LEXER-JSON-BEGIN---'
const SENT_END = '---LEXER-JSON-END---'

export type TokenOutcome =
  | { kind: 'tokens'; tokens: Token[] }
  | { kind: 'error'; message: string }

export interface TestResult {
  name: string
  input: string
  expected: TokenOutcome
  got: TokenOutcome
  ok: boolean
}

export interface TestPayload {
  results: TestResult[]
}

export interface ParseFailure {
  ok: false
  reason: 'no-sentinel' | 'invalid-json' | 'bad-shape'
  detail?: string
}

export interface ParseSuccess<T> {
  ok: true
  payload: T
}

function hasTokenArray(value: unknown): value is Token[] {
  return Array.isArray(value) && value.every(isToken)
}

function isToken(value: unknown): value is Token {
  if (!value || typeof value !== 'object' || !('kind' in value)) return false
  const token = value as { kind: unknown; value?: unknown }
  switch (token.kind) {
    case 'TokNum':
      return typeof token.value === 'number'
    case 'TokIdent':
      return typeof token.value === 'string'
    case 'TokSoma':
    case 'TokMult':
    case 'TokAbrePar':
    case 'TokFechaPar':
      return true
    default:
      return false
  }
}

function hasTokenOutcome(value: unknown): value is TokenOutcome {
  if (!value || typeof value !== 'object' || !('kind' in value)) return false
  const kind = (value as { kind: unknown }).kind
  if (kind === 'tokens') {
    return hasTokenArray((value as { tokens?: unknown }).tokens)
  }
  if (kind === 'error') {
    return typeof (value as { message?: unknown }).message === 'string'
  }
  return false
}

function isTestPayload(value: unknown): value is TestPayload {
  if (!value || typeof value !== 'object' || !('results' in value)) return false
  const results = (value as { results?: unknown }).results
  return (
    Array.isArray(results) &&
    results.every((result) => {
      if (!result || typeof result !== 'object') return false
      const row = result as Record<string, unknown>
      return (
        typeof row.name === 'string' &&
        typeof row.input === 'string' &&
        typeof row.ok === 'boolean' &&
        hasTokenOutcome(row.expected) &&
        hasTokenOutcome(row.got)
      )
    })
  )
}

function extractSentinelJson(sout: string): ParseSuccess<unknown> | ParseFailure {
  const beg = sout.indexOf(SENT_BEG)
  if (beg < 0) return { ok: false, reason: 'no-sentinel' }
  const bodyStart = beg + SENT_BEG.length
  const end = sout.indexOf(SENT_END, bodyStart)
  if (end < 0) return { ok: false, reason: 'no-sentinel' }
  const body = sout.slice(bodyStart, end).trim()
  try {
    return { ok: true, payload: JSON.parse(body) }
  } catch (e) {
    return {
      ok: false,
      reason: 'invalid-json',
      detail: (e as Error).message,
    }
  }
}

export function extractTestPayload(
  sout: string,
): ParseSuccess<TestPayload> | ParseFailure {
  const parsed = extractSentinelJson(sout)
  if (!parsed.ok) return parsed
  if (!isTestPayload(parsed.payload)) return { ok: false, reason: 'bad-shape' }
  return { ok: true, payload: parsed.payload }
}
