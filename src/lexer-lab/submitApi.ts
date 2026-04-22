export interface SubmitSuccessPayload {
  submissionId: number
  ec: number
  sout: string
  serr: string
  timesecs: number
}

export interface SubmitApiErrorPayload {
  code: string
  message: string
  retryAfterMs?: number
}

const BLOCKED_ERROR_CODES = new Set([
  'email_cooldown',
  'email_limit_15m',
  'email_limit_1h',
  'email_in_flight',
  'ip_limit',
  'server_busy',
])

export async function readSubmitSuccessPayload(
  response: Response,
): Promise<SubmitSuccessPayload | null> {
  try {
    const json = (await response.json()) as unknown
    return isSubmitSuccessPayload(json) ? json : null
  } catch {
    return null
  }
}

export async function readSubmitApiError(
  response: Response,
): Promise<SubmitApiErrorPayload | null> {
  try {
    const json = (await response.json()) as unknown
    return isSubmitApiErrorPayload(json) ? json : null
  } catch {
    return null
  }
}

export function isBlockedSubmitError(code?: string): boolean {
  return typeof code === 'string' && BLOCKED_ERROR_CODES.has(code)
}

export function describeSubmitApiError(
  error: SubmitApiErrorPayload | { message: string; retryAfterMs?: number },
): string {
  if (typeof error.retryAfterMs === 'number' && error.retryAfterMs > 0) {
    return `${error.message} Aguarde ${formatRetryAfterMs(error.retryAfterMs)}.`
  }
  return error.message
}

export function formatRetryAfterMs(retryAfterMs: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
  return seconds === 1 ? '1 segundo' : `${seconds} segundos`
}

function isSubmitSuccessPayload(value: unknown): value is SubmitSuccessPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as Record<string, unknown>
  return (
    typeof payload.submissionId === 'number' &&
    typeof payload.ec === 'number' &&
    typeof payload.sout === 'string' &&
    typeof payload.serr === 'string' &&
    typeof payload.timesecs === 'number'
  )
}

function isSubmitApiErrorPayload(
  value: unknown,
): value is SubmitApiErrorPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as Record<string, unknown>
  return (
    typeof payload.code === 'string' &&
    typeof payload.message === 'string' &&
    (typeof payload.retryAfterMs === 'undefined' ||
      typeof payload.retryAfterMs === 'number')
  )
}
