import type { TestResult, TokenOutcome } from '../lexer-lab/payloads'
import { tokenLabel } from '../lexer-lab/types'
import styles from './FixtureChecklist.module.css'

function renderOutcome(outcome: TokenOutcome): string {
  if (outcome.kind === 'error') return `error: ${outcome.message}`
  if (outcome.tokens.length === 0) return '[]'
  return `[${outcome.tokens.map(tokenLabel).join(', ')}]`
}

interface Props {
  results: TestResult[]
  submitStatus: 'idle' | 'loading' | 'ok' | 'error' | 'blocked'
  totalChecks: number
}

export function FixtureChecklist({ results, submitStatus, totalChecks }: Props) {
  const firstFailure = results.findIndex((row) => !row.ok)
  const passedCount = results.filter((row) => row.ok).length

  if (results.length === 0) {
    return (
      <section className={styles.panel} aria-label="Case checklist">
        <header className={styles.header}>
          <div>
            <span className={styles.kicker}>Cases</span>
            <h3 className={styles.title}>{totalChecks} judge checks</h3>
          </div>
        </header>
        <p className={styles.empty}>
          {submitStatus === 'loading'
            ? 'Running cases...'
            : 'Submit your lexer to see which cases pass.'}
        </p>
      </section>
    )
  }

  const allPassed = passedCount === results.length
  const tone: 'pass' | 'fail' | 'partial' =
    allPassed ? 'pass' : passedCount === 0 ? 'fail' : 'partial'

  return (
    <section className={styles.panel} aria-label="Case checklist">
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>Cases</span>
          <h3 className={styles.title}>{totalChecks} judge checks</h3>
        </div>
        <div className={styles.headerMeta} data-tone={tone}>
          {passedCount}/{totalChecks}
        </div>
      </header>
      <div className={styles.rows}>
        {results.map((row, index) => (
          <article
            key={`${row.name}-${row.input}`}
            className={styles.row}
            data-status={row.ok ? 'ok' : 'fail'}
            data-primary={!row.ok && index === firstFailure}
          >
            <div className={styles.rowHead}>
              <span className={styles.badge} aria-hidden="true">
                {row.ok ? '✓' : '✗'}
              </span>
              <div>
                <div className={styles.rowTitle}>{row.name}</div>
                <div className={styles.rowMeta}>input: {row.input}</div>
              </div>
            </div>
            {!row.ok && index === firstFailure && (
              <div className={styles.diff}>
                <div className={styles.diffBlock}>
                  <span className={styles.diffLabel}>expected</span>
                  <code>{renderOutcome(row.expected)}</code>
                </div>
                <div className={styles.diffBlock}>
                  <span className={styles.diffLabel}>got</span>
                  <code>{renderOutcome(row.got)}</code>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
