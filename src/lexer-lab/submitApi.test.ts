import { describe, expect, it } from 'vitest'
import {
  describeSubmitApiError,
  formatRetryAfterMs,
  isBlockedSubmitError,
} from './submitApi'

describe('submit api helpers', () => {
  it('formats retry windows for the courtesy cooldown', () => {
    expect(formatRetryAfterMs(500)).toBe('1 second')
    expect(formatRetryAfterMs(5_800)).toBe('6 seconds')
  })

  it('marks limiter and busy responses as blocked submits', () => {
    expect(isBlockedSubmitError('ip_limit')).toBe(true)
    expect(isBlockedSubmitError('server_busy')).toBe(true)
    expect(isBlockedSubmitError('template_tamper')).toBe(false)
  })

  it('appends retry guidance to backend messages', () => {
    expect(
      describeSubmitApiError({
        message: 'Too many submissions.',
        retryAfterMs: 4_000,
      }),
    ).toBe('Too many submissions. Retry in 4 seconds.')
  })
})
