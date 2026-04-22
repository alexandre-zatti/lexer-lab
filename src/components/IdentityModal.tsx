import { useEffect, useState } from 'react'
import { Mail, ShieldCheck } from 'lucide-react'
import { validateInstitutionalEmail } from '../lexer-lab/email'
import styles from './IdentityModal.module.css'

interface Props {
  open: boolean
  initialEmail: string | null
  onClose: () => void
  onConfirm: (email: string) => void
}

export function IdentityModal({
  open,
  initialEmail,
  onClose,
  onConfirm,
}: Props) {
  const [draftEmail, setDraftEmail] = useState(initialEmail ?? '')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setDraftEmail(initialEmail ?? '')
    setError('')
  }, [initialEmail, open])

  if (!open) return null

  function submitForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const validation = validateInstitutionalEmail(draftEmail)
    if (!validation.ok) {
      setError(validation.error)
      return
    }
    setError('')
    onConfirm(validation.email)
  }

  return (
    <div className={styles.overlay} role="presentation">
      <div
        className={styles.backdrop}
        onClick={onClose}
        aria-hidden="true"
      />
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="identity-modal-title"
      >
        <header className={styles.header}>
          <div className={styles.iconWrap}>
            <ShieldCheck size={18} strokeWidth={1.9} aria-hidden="true" />
          </div>
          <div>
            <p className={styles.kicker}>Identificação</p>
            <h2 id="identity-modal-title" className={styles.title}>
              Email da submissão
            </h2>
          </div>
        </header>

        <p className={styles.body}>
          Informe seu email institucional ou altere o email salvo para esta
          submissão.
        </p>

        <form className={styles.form} onSubmit={submitForm}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Email institucional</span>
            <span className={styles.inputWrap}>
              <Mail size={16} strokeWidth={1.85} aria-hidden="true" />
              <input
                type="email"
                autoFocus
                autoComplete="email"
                value={draftEmail}
                onChange={(e) => setDraftEmail(e.target.value)}
                placeholder="nome@estudante.uffs.edu.br"
              />
            </span>
          </label>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className={styles.primary}>
              Submeter
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
