import { describe, expect, it } from 'vitest'
import {
  maskEmail,
  normalizeEmail,
  validateInstitutionalEmail,
} from './email'

describe('email helpers', () => {
  it('normalizes the stored email', () => {
    expect(normalizeEmail('  Nome@UFFS.edu.br  ')).toBe('nome@uffs.edu.br')
  })

  it('accepts approved institutional domains', () => {
    expect(
      validateInstitutionalEmail('aluno@estudante.uffs.edu.br'),
    ).toEqual({
      ok: true,
      email: 'aluno@estudante.uffs.edu.br',
    })
    expect(validateInstitutionalEmail('docente@uffs.edu.br')).toEqual({
      ok: true,
      email: 'docente@uffs.edu.br',
    })
  })

  it('rejects non-institutional domains', () => {
    expect(validateInstitutionalEmail('aluno@gmail.com')).toEqual({
      ok: false,
      error:
        'Use seu email institucional @estudante.uffs.edu.br ou @uffs.edu.br.',
    })
  })

  it('masks the local part for the topbar summary', () => {
    expect(maskEmail('estudante@estudante.uffs.edu.br')).toBe(
      'es***e@estudante.uffs.edu.br',
    )
  })
})
