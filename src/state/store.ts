import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { normalizeEmail } from '../lexer-lab/email'
import type { TestResult } from '../lexer-lab/payloads'
import { studentTemplate } from '../lexer-lab/template'

export type RequestStatus = 'idle' | 'loading' | 'ok' | 'error' | 'blocked'

interface SubmitFeedbackOptions {
  preserveResults?: boolean
  nextAllowedSubmitAt?: number | null
}

interface LabState {
  studentCode: string
  lastSubmittedCode: string | null
  studentEmail: string | null
  clientSessionId: string
  nextAllowedSubmitAt: number | null
  submitStatus: RequestStatus
  serr: string
  testResults: TestResult[]
  lastSubmitLatencyMs: number

  setStudentCode: (code: string) => void
  resetStudentCode: () => void
  restoreLastSubmittedCode: () => void
  recordLastSubmittedCode: (code: string) => void
  setStudentEmail: (email: string) => void
  clearStudentEmail: () => void
  setNextAllowedSubmitAt: (timestamp: number | null) => void
  startSubmit: () => void
  finishSubmit: (
    results: TestResult[],
    serr: string,
    latencyMs: number,
    nextAllowedSubmitAt: number | null,
  ) => void
  setSubmitError: (
    serr: string,
    status: 'error' | 'blocked',
    options?: SubmitFeedbackOptions,
  ) => void
}

const DEFAULT_STUDENT_CODE = studentTemplate.body
const REQUIRED_SIGNATURE = 'lexer :: String -> [Token]'
const LEGACY_TOKEN_COMMENT =
  '-- Tokens esperados: TokNum n, TokSoma, TokMult, TokAbrePar, TokFechaPar'
const CURRENT_TOKEN_COMMENT =
  '-- Tokens esperados: TokNum n, TokIdent nome, TokSoma, TokMult, TokAbrePar, TokFechaPar'
const LEGACY_DEFAULT_STUDENT_CODES = [
  'lexer :: String -> [Token]\nlexer input = error "TODO: implemente o lexer"\n',
  '-- Tokens esperados: TokNum n, TokSoma, TokMult, TokAbrePar, TokFechaPar\nlexer :: String -> [Token]\nlexer input = error "TODO: implemente o lexer"\n',
  '-- Tokens esperados: TokNum n, TokSoma, TokMult, TokAbrePar, TokFechaPar\nlexer :: String -> [Token]\n\n',
] as const

function normalizeStudentCode(code: string | null | undefined): string {
  if (typeof code !== 'string' || code.length === 0) {
    return DEFAULT_STUDENT_CODE
  }
  const normalizedCode = code.replace(LEGACY_TOKEN_COMMENT, CURRENT_TOKEN_COMMENT)
  if (
    LEGACY_DEFAULT_STUDENT_CODES.includes(
      code as (typeof LEGACY_DEFAULT_STUDENT_CODES)[number],
    )
  ) {
    return DEFAULT_STUDENT_CODE
  }
  if (
    normalizedCode.includes(REQUIRED_SIGNATURE) ||
    normalizedCode.includes('lexer ::')
  ) {
    return normalizedCode
  }
  return `${REQUIRED_SIGNATURE}\n${normalizedCode.startsWith('\n') ? '' : '\n'}${normalizedCode}`
}

function normalizePersistedEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null
  const normalized = normalizeEmail(email)
  return normalized.length > 0 ? normalized : null
}

function normalizePersistedNextAllowedSubmitAt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value > Date.now() ? value : null
}

function generateClientSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `session-${Date.now()}`
}

function ensureClientSessionId(value: unknown): string {
  return typeof value === 'string' && value.length > 0
    ? value
    : generateClientSessionId()
}

export const useLabStore = create<LabState>()(
  persist(
    (set) => ({
      studentCode: DEFAULT_STUDENT_CODE,
      lastSubmittedCode: null,
      studentEmail: null,
      clientSessionId: generateClientSessionId(),
      nextAllowedSubmitAt: null,
      submitStatus: 'idle',
      serr: '',
      testResults: [],
      lastSubmitLatencyMs: 0,

      setStudentCode: (studentCode) => set({ studentCode }),
      resetStudentCode: () => set({ studentCode: DEFAULT_STUDENT_CODE }),
      restoreLastSubmittedCode: () =>
        set((state) =>
          state.lastSubmittedCode
            ? { studentCode: state.lastSubmittedCode }
            : {},
        ),
      recordLastSubmittedCode: (lastSubmittedCode) => set({ lastSubmittedCode }),
      setStudentEmail: (studentEmail) => set({ studentEmail }),
      clearStudentEmail: () => set({ studentEmail: null }),
      setNextAllowedSubmitAt: (nextAllowedSubmitAt) =>
        set({ nextAllowedSubmitAt }),
      startSubmit: () =>
        set({
          submitStatus: 'loading',
          serr: '',
          testResults: [],
        }),
      finishSubmit: (testResults, serr, latencyMs, nextAllowedSubmitAt) =>
        set({
          testResults,
          serr,
          lastSubmitLatencyMs: latencyMs,
          submitStatus: 'ok',
          nextAllowedSubmitAt,
        }),
      setSubmitError: (serr, status, options) =>
        set((state) => ({
          submitStatus: status,
          serr,
          testResults: options?.preserveResults ? state.testResults : [],
          nextAllowedSubmitAt:
            typeof options?.nextAllowedSubmitAt === 'number' ||
            options?.nextAllowedSubmitAt === null
              ? options.nextAllowedSubmitAt
              : state.nextAllowedSubmitAt,
        })),
    }),
    {
      name: 'lexer-lab-editor',
      version: 7,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState) => {
        const state = persistedState as Partial<LabState> | undefined
        return {
          ...state,
          studentCode: normalizeStudentCode(state?.studentCode),
          lastSubmittedCode:
            typeof state?.lastSubmittedCode === 'string'
              ? normalizeStudentCode(state.lastSubmittedCode)
              : null,
          studentEmail: normalizePersistedEmail(state?.studentEmail),
          clientSessionId: ensureClientSessionId(state?.clientSessionId),
          nextAllowedSubmitAt: normalizePersistedNextAllowedSubmitAt(
            state?.nextAllowedSubmitAt,
          ),
        } satisfies Partial<LabState>
      },
      partialize: ({
        studentCode,
        lastSubmittedCode,
        studentEmail,
        clientSessionId,
        nextAllowedSubmitAt,
      }) => ({
        studentCode,
        lastSubmittedCode,
        studentEmail,
        clientSessionId,
        nextAllowedSubmitAt,
      }),
    },
  ),
)
