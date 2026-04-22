import { beforeEach, describe, expect, it } from 'vitest'
import { useLabStore } from './store'

describe('lab store', () => {
  beforeEach(() => {
    useLabStore.persist.clearStorage()
    useLabStore.setState({
      studentCode: '',
      lastSubmittedCode: null,
      studentEmail: null,
      clientSessionId: 'test-session',
      nextAllowedSubmitAt: null,
      submitStatus: 'idle',
      serr: '',
      testResults: [],
      lastSubmitLatencyMs: 0,
    })
  })

  it('can save and clear the student email', () => {
    useLabStore.getState().setStudentEmail('aluno@uffs.edu.br')
    expect(useLabStore.getState().studentEmail).toBe('aluno@uffs.edu.br')

    useLabStore.getState().clearStudentEmail()
    expect(useLabStore.getState().studentEmail).toBeNull()
  })

  it('preserves existing judge results for blocked submit feedback', () => {
    useLabStore.setState({
      testResults: [
        {
          name: 'ok',
          input: '1',
          expected: { kind: 'tokens', tokens: [{ kind: 'TokNum', value: 1 }] },
          got: { kind: 'tokens', tokens: [{ kind: 'TokNum', value: 1 }] },
          ok: true,
        },
      ],
    })

    useLabStore.getState().setSubmitError('Aguarde.', 'blocked', {
      preserveResults: true,
      nextAllowedSubmitAt: 123,
    })

    expect(useLabStore.getState().submitStatus).toBe('blocked')
    expect(useLabStore.getState().testResults).toHaveLength(1)
    expect(useLabStore.getState().nextAllowedSubmitAt).toBe(123)
  })
})
