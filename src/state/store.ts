import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
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
  nextAllowedSubmitAt: number | null
  submitStatus: RequestStatus
  serr: string
  testResults: TestResult[]
  lastSubmitLatencyMs: number

  setStudentCode: (code: string) => void
  resetStudentCode: () => void
  restoreLastSubmittedCode: () => void
  recordLastSubmittedCode: (code: string) => void
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

export const useLabStore = create<LabState>()(
  persist(
    (set) => ({
      studentCode: DEFAULT_STUDENT_CODE,
      lastSubmittedCode: null,
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
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ studentCode, lastSubmittedCode, nextAllowedSubmitAt }) => ({
        studentCode,
        lastSubmittedCode,
        nextAllowedSubmitAt,
      }),
    },
  ),
)
