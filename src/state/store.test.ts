import { beforeEach, describe, expect, it } from 'vitest'
import { useLabStore } from './store'

describe('lab store', () => {
  beforeEach(() => {
    useLabStore.persist.clearStorage()
    useLabStore.setState({
      studentCode: '',
      lastSubmittedCode: null,
      nextAllowedSubmitAt: null,
      submitStatus: 'idle',
      serr: '',
      testResults: [],
      lastSubmitLatencyMs: 0,
    })
  })

  it('records and restores the last submitted code', () => {
    useLabStore.getState().recordLastSubmittedCode('lexer s = []\n')
    useLabStore.setState({ studentCode: 'different' })
    useLabStore.getState().restoreLastSubmittedCode()
    expect(useLabStore.getState().studentCode).toBe('lexer s = []\n')
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

    useLabStore.getState().setSubmitError('Wait a moment.', 'blocked', {
      preserveResults: true,
      nextAllowedSubmitAt: 123,
    })

    expect(useLabStore.getState().submitStatus).toBe('blocked')
    expect(useLabStore.getState().testResults).toHaveLength(1)
    expect(useLabStore.getState().nextAllowedSubmitAt).toBe(123)
  })
})
