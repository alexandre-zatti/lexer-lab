import { describe, expect, it } from 'vitest'
import {
  describeSubmitApiError,
  formatRetryAfterMs,
  isBlockedSubmitError,
} from './submitApi'

describe('submit api helpers', () => {
  it('formats retry windows for the courtesy cooldown', () => {
    expect(formatRetryAfterMs(500)).toBe('1 segundo')
    expect(formatRetryAfterMs(5_800)).toBe('6 segundos')
  })

  it('marks limiter and busy responses as blocked submits', () => {
    expect(isBlockedSubmitError('email_cooldown')).toBe(true)
    expect(isBlockedSubmitError('server_busy')).toBe(true)
    expect(isBlockedSubmitError('template_tamper')).toBe(false)
  })

  it('appends retry guidance to backend messages', () => {
    expect(
      describeSubmitApiError({
        message: 'Aguarde antes de enviar outra submissão.',
        retryAfterMs: 4_000,
      }),
    ).toBe(
      'Aguarde antes de enviar outra submissão. Aguarde 4 segundos.',
    )
  })
})
