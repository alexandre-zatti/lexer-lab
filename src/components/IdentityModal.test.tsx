import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IdentityModal } from './IdentityModal'

describe('IdentityModal', () => {
  it('shows a validation error for non-institutional domains', () => {
    render(
      <IdentityModal
        open
        initialEmail={null}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    )

    fireEvent.change(screen.getByLabelText('Email institucional'), {
      target: { value: 'aluno@gmail.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submeter' }))

    expect(
      screen.getByText(
        'Use seu email institucional @estudante.uffs.edu.br ou @uffs.edu.br.',
      ),
    ).toBeInTheDocument()
  })

  it('normalizes a valid email before confirming', () => {
    const onConfirm = vi.fn()

    render(
      <IdentityModal
        open
        initialEmail="antigo@uffs.edu.br"
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    )

    fireEvent.change(screen.getByLabelText('Email institucional'), {
      target: { value: '  Novo@UFFS.edu.br ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submeter' }))

    expect(onConfirm).toHaveBeenCalledWith('novo@uffs.edu.br')
  })
})
