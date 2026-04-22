const ALLOWED_EMAIL_DOMAINS = ['estudante.uffs.edu.br', 'uffs.edu.br'] as const
const EMAIL_LOCAL_PART_RE = /^[a-z0-9._%+-]+$/

export function normalizeEmail(rawEmail: string): string {
  return rawEmail.trim().toLowerCase()
}

export function validateInstitutionalEmail(
  rawEmail: string,
): { ok: true; email: string } | { ok: false; error: string } {
  const normalized = normalizeEmail(rawEmail)
  const parts = normalized.split('@')

  if (parts.length !== 2) {
    return { ok: false, error: 'Use um email institucional valido.' }
  }

  const [localPart, domain] = parts
  if (!localPart || !EMAIL_LOCAL_PART_RE.test(localPart)) {
    return { ok: false, error: 'Use um email institucional valido.' }
  }

  if (!ALLOWED_EMAIL_DOMAINS.includes(domain as (typeof ALLOWED_EMAIL_DOMAINS)[number])) {
    return {
      ok: false,
      error: 'Use seu email institucional @estudante.uffs.edu.br ou @uffs.edu.br.',
    }
  }

  return { ok: true, email: normalized }
}

export function maskEmail(email: string): string {
  const normalized = normalizeEmail(email)
  const [localPart, domain] = normalized.split('@')
  if (!localPart || !domain) return normalized
  if (localPart.length <= 2) return `${localPart[0] ?? '*'}***@${domain}`
  return `${localPart.slice(0, 2)}***${localPart.slice(-1)}@${domain}`
}
