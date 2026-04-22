import { useLabStore } from '../state/store'
import styles from './ErrorPanel.module.css'

export function ErrorPanel() {
  const serr = useLabStore((s) => s.serr)
  const submitStatus = useLabStore((s) => s.submitStatus)
  if (!serr) return null
  const isError = submitStatus === 'error'
  const label =
    submitStatus === 'blocked'
      ? 'Envio bloqueado'
      : isError
        ? 'Erro na submissão'
        : 'stderr (aviso do GHC)'
  return (
    <section
      className={`${styles.panel} ${isError ? styles.panelError : ''}`}
      aria-label={label}
    >
      <div className={styles.label}>{label}</div>
      <pre className={styles.pre}>{serr}</pre>
    </section>
  )
}
