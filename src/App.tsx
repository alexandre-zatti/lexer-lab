import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import {
  AlertTriangle,
  BookOpen,
  Clock3,
  ListChecks,
  RotateCcw,
  SendHorizontal,
} from 'lucide-react'
import { Editor, type EditorHandle } from './components/Editor'
import { hasRequiredSignature } from './components/editor/localChecks'
import { ErrorPanel } from './components/ErrorPanel'
import { FixtureChecklist } from './components/FixtureChecklist'
import { judgeFixtures } from './lexer-lab/judgeFixtures'
import { extractTestPayload } from './lexer-lab/payloads'
import {
  describeSubmitApiError,
  formatRetryAfterMs,
  isBlockedSubmitError,
  readSubmitApiError,
  readSubmitSuccessPayload,
} from './lexer-lab/submitApi'
import { mergeStudentBody } from './lexer-lab/template'
import { useLabStore } from './state/store'
import styles from './App.module.css'

const API_URL: string =
  (import.meta.env.VITE_HASKELL_API as string | undefined) ??
  'http://localhost:8080'

const CLIENT_COURTESY_COOLDOWN_MS = 10_000

const TASK_COPY =
  'Write the function `lexer :: String -> [Token]` that turns the input into numbers, identifiers, and symbols. Identifiers start with a letter and may continue with letters, digits, or `_`. Skip whitespace and fail on any invalid character.'
const EDITOR_SHORTCUT_HINT = 'Tab indents · Ctrl/Cmd-Enter submits'

const IMPLEMENTATION_POINTS = [
  {
    title: 'Numbers',
    body: 'Consecutive digits should collapse into a single TokNum n.',
  },
  {
    title: 'Identifiers',
    body: 'Start with a letter; extend with letters, digits, and `_` using maximal munch.',
  },
  {
    title: 'Symbols',
    body: 'The characters +, *, ( and ) become TokPlus, TokStar, TokLParen, TokRParen.',
  },
  {
    title: 'Whitespace',
    body: 'Whitespace characters must be skipped.',
  },
  {
    title: 'Errors',
    body: 'If a character outside the contract appears, the lexer must fail.',
  },
]

const REQUIRED_SIGNATURE = `lexer :: String -> [Token]`

type LeftTab = 'problem' | 'inputs'
type BottomTab = 'judge' | 'stderr'

const LEFT_MIN = 260
const LEFT_MAX = 560
const LEFT_DEFAULT = 380
const BOTTOM_MIN = 160
const BOTTOM_MAX_RATIO = 0.7
const BOTTOM_DEFAULT = 300
const TOTAL_CHECKS = judgeFixtures.length

export default function App() {
  const [leftTab, setLeftTab] = useState<LeftTab>('problem')
  const [bottomTab, setBottomTab] = useState<BottomTab>('judge')
  const [leftWidth, setLeftWidth] = useState(LEFT_DEFAULT)
  const [bottomHeight, setBottomHeight] = useState(BOTTOM_DEFAULT)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<EditorHandle | null>(null)

  const studentCode = useLabStore((s) => s.studentCode)
  const lastSubmittedCode = useLabStore((s) => s.lastSubmittedCode)
  const nextAllowedSubmitAt = useLabStore((s) => s.nextAllowedSubmitAt)
  const resetStudentCode = useLabStore((s) => s.resetStudentCode)
  const restoreLastSubmittedCode = useLabStore((s) => s.restoreLastSubmittedCode)
  const recordLastSubmittedCode = useLabStore((s) => s.recordLastSubmittedCode)
  const setNextAllowedSubmitAt = useLabStore((s) => s.setNextAllowedSubmitAt)
  const submitStatus = useLabStore((s) => s.submitStatus)
  const serr = useLabStore((s) => s.serr)
  const testResults = useLabStore((s) => s.testResults)
  const lastSubmitLatencyMs = useLabStore((s) => s.lastSubmitLatencyMs)
  const startSubmit = useLabStore((s) => s.startSubmit)
  const finishSubmit = useLabStore((s) => s.finishSubmit)
  const setSubmitError = useLabStore((s) => s.setSubmitError)

  const passedCount = useMemo(
    () => testResults.filter((row) => row.ok).length,
    [testResults],
  )
  const allPassed = testResults.length > 0 && passedCount === testResults.length
  const firstFailure = testResults.find((row) => !row.ok) ?? null
  const judgeProgress = (passedCount / TOTAL_CHECKS) * 100

  const courtesyRemainingMs = nextAllowedSubmitAt
    ? Math.max(0, nextAllowedSubmitAt - nowMs)
    : 0

  useEffect(() => {
    if (submitStatus === 'loading') setBottomTab('judge')
  }, [submitStatus])

  useEffect(() => {
    if (submitStatus === 'error' || submitStatus === 'blocked') {
      setBottomTab('stderr')
    }
  }, [submitStatus])

  useEffect(() => {
    if (!nextAllowedSubmitAt) return
    if (nextAllowedSubmitAt <= Date.now()) {
      setNextAllowedSubmitAt(null)
      return
    }
    const timer = window.setInterval(() => {
      const nextNow = Date.now()
      setNowMs(nextNow)
      if (nextAllowedSubmitAt <= nextNow) {
        setNextAllowedSubmitAt(null)
      }
    }, 250)
    return () => window.clearInterval(timer)
  }, [nextAllowedSubmitAt, setNextAllowedSubmitAt])

  const submitSolution = useCallback(async () => {
    if (submitStatus === 'loading') return
    setBottomTab('judge')
    recordLastSubmittedCode(studentCode)
    startSubmit()

    const t0 = performance.now()
    try {
      const response = await fetch(`${API_URL}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: mergeStudentBody(studentCode) }),
      })

      if (!response.ok) {
        const apiError = await readSubmitApiError(response)
        const message = apiError
          ? describeSubmitApiError(apiError)
          : `backend HTTP ${response.status}`
        const nextAllowed =
          typeof apiError?.retryAfterMs === 'number'
            ? Date.now() + apiError.retryAfterMs
            : undefined
        setSubmitError(
          message,
          apiError && isBlockedSubmitError(apiError.code) ? 'blocked' : 'error',
          {
            preserveResults:
              Boolean(apiError) && isBlockedSubmitError(apiError?.code),
            nextAllowedSubmitAt: nextAllowed,
          },
        )
        return
      }

      const payload = await readSubmitSuccessPayload(response)
      if (!payload) {
        setSubmitError('failed to read backend response', 'error')
        return
      }

      if (payload.ec !== 0) {
        setSubmitError(
          payload.serr || `runghc exited with code ${payload.ec}`,
          'error',
        )
        return
      }

      const parsed = extractTestPayload(payload.sout)
      if (!parsed.ok) {
        setSubmitError(
          `failed to parse backend response (${parsed.reason}${
            parsed.detail ? `: ${parsed.detail}` : ''
          })`,
          'error',
        )
        return
      }

      finishSubmit(
        parsed.payload.results,
        payload.serr,
        performance.now() - t0 || payload.timesecs * 1000,
        Date.now() + CLIENT_COURTESY_COOLDOWN_MS,
      )
      setBottomTab('judge')
    } catch (e) {
      setSubmitError(`request failed: ${(e as Error).message}`, 'error')
    }
  }, [
    finishSubmit,
    recordLastSubmittedCode,
    setSubmitError,
    startSubmit,
    studentCode,
    submitStatus,
  ])

  const requestSubmit = useCallback(async () => {
    if (submitStatus === 'loading') return

    if (courtesyRemainingMs > 0) {
      setSubmitError(
        `Wait ${formatRetryAfterMs(courtesyRemainingMs)} before submitting again.`,
        'blocked',
        {
          preserveResults: true,
          nextAllowedSubmitAt: nextAllowedSubmitAt ?? null,
        },
      )
      return
    }

    await submitSolution()
  }, [
    courtesyRemainingMs,
    nextAllowedSubmitAt,
    setSubmitError,
    submitSolution,
    submitStatus,
  ])

  const startHorizontalDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = leftWidth
      const move = (ev: PointerEvent) => {
        const next = Math.max(
          LEFT_MIN,
          Math.min(LEFT_MAX, startW + ev.clientX - startX),
        )
        setLeftWidth(next)
      }
      const up = () => {
        document.removeEventListener('pointermove', move)
        document.removeEventListener('pointerup', up)
        document.body.style.removeProperty('cursor')
        document.body.style.removeProperty('user-select')
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('pointermove', move)
      document.addEventListener('pointerup', up)
    },
    [leftWidth],
  )

  const startVerticalDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      const startY = e.clientY
      const startH = bottomHeight
      const workspaceH = workspaceRef.current?.clientHeight ?? 800
      const move = (ev: PointerEvent) => {
        const maxH = workspaceH * BOTTOM_MAX_RATIO
        const next = Math.max(
          BOTTOM_MIN,
          Math.min(maxH, startH - (ev.clientY - startY)),
        )
        setBottomHeight(next)
      }
      const up = () => {
        document.removeEventListener('pointermove', move)
        document.removeEventListener('pointerup', up)
        document.body.style.removeProperty('cursor')
        document.body.style.removeProperty('user-select')
      }
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('pointermove', move)
      document.addEventListener('pointerup', up)
    },
    [bottomHeight],
  )

  const workspaceStyle = {
    '--left-col': `${leftWidth}px`,
    '--bottom-row': `${bottomHeight}px`,
  } as CSSProperties

  const hasStderr = serr.length > 0
  const stderrIsError = submitStatus === 'error'
  const hasLastSubmittedCode = lastSubmittedCode !== null
  const hasRequiredLexerSignature = hasRequiredSignature(studentCode)

  const judgeTone: 'idle' | 'loading' | 'pass' | 'fail' =
    submitStatus === 'loading'
      ? 'loading'
      : testResults.length === 0
        ? 'idle'
        : allPassed
          ? 'pass'
          : 'fail'

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.brandText}>
            <span className={styles.brandMark}>Lexer Lab</span>
            <span className={styles.brandSub}>Lexical analysis challenge</span>
          </div>
        </div>

        <div className={styles.topbarCenter} aria-label="Submission status">
          <div className={styles.judgeChip} data-tone={judgeTone}>
            <span className={styles.judgeDot} aria-hidden="true" />
            <span className={styles.judgeCount}>
              <strong>{passedCount}</strong>
              <span>/{TOTAL_CHECKS}</span>
            </span>
            <span className={styles.judgeLabel}>judge</span>
          </div>
          {lastSubmitLatencyMs > 0 && (
            <div className={styles.latencyChip}>
              <Clock3 size={13} strokeWidth={1.75} aria-hidden="true" />
              <span>{lastSubmitLatencyMs.toFixed(0)} ms</span>
            </div>
          )}
          {courtesyRemainingMs > 0 && (
            <div className={styles.cooldownChip}>
              <Clock3 size={13} strokeWidth={1.75} aria-hidden="true" />
              <span>
                next submit in {formatRetryAfterMs(courtesyRemainingMs)}
              </span>
            </div>
          )}
        </div>

        <div className={styles.topbarActions}>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => {
              resetStudentCode()
              focusEditorSoon(editorRef)
            }}
            title="Restore the starter code"
          >
            <RotateCcw size={14} strokeWidth={1.75} />
            <span>Reset</span>
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => {
              restoreLastSubmittedCode()
              focusEditorSoon(editorRef)
            }}
            title="Restore the most recent submission"
            disabled={!hasLastSubmittedCode}
          >
            <Clock3 size={14} strokeWidth={1.75} />
            <span>Last submit</span>
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => void requestSubmit()}
            disabled={submitStatus === 'loading'}
          >
            {submitStatus === 'loading' ? (
              <span className={styles.spinner} aria-hidden="true" />
            ) : (
              <SendHorizontal size={14} strokeWidth={1.75} />
            )}
            <span>
              {submitStatus === 'loading'
                ? 'Running'
                : courtesyRemainingMs > 0
                  ? 'Wait'
                  : 'Submit'}
            </span>
          </button>
        </div>
      </header>

      <div
        ref={workspaceRef}
        className={styles.workspace}
        style={workspaceStyle}
      >
        <aside className={styles.leftPane}>
          <nav className={styles.tabBar} aria-label="Problem panel">
            <button
              type="button"
              className={styles.tab}
              data-active={leftTab === 'problem'}
              onClick={() => setLeftTab('problem')}
            >
              <BookOpen size={14} strokeWidth={1.75} />
              <span>Problem</span>
            </button>
            <button
              type="button"
              className={styles.tab}
              data-active={leftTab === 'inputs'}
              onClick={() => setLeftTab('inputs')}
            >
              <ListChecks size={14} strokeWidth={1.75} />
              <span>Test cases</span>
            </button>
          </nav>

          <div className={styles.paneBody}>
            {leftTab === 'problem' && (
              <article className={styles.brief}>
                <header className={styles.briefHead}>
                  <span className={styles.eyebrow}>Problem</span>
                  <h1 className={styles.briefTitle}>
                    Implement the arithmetic lexer
                  </h1>
                  <p className={styles.briefLead}>{TASK_COPY}</p>
                </header>

                <section className={styles.sectionBlock}>
                  <span className={styles.eyebrow}>What to do</span>
                  <div className={styles.contractGrid}>
                    {IMPLEMENTATION_POINTS.map((item, i) => (
                      <section key={item.title} className={styles.contractCard}>
                        <span className={styles.contractIndex}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <h3>{item.title}</h3>
                          <p>{item.body}</p>
                        </div>
                      </section>
                    ))}
                  </div>
                </section>

                <section className={styles.sectionBlock}>
                  <span className={styles.eyebrow}>Required signature</span>
                  <pre className={styles.providedBlock}>
                    <code>{REQUIRED_SIGNATURE}</code>
                  </pre>
                  <p className={styles.providedCaption}>
                    You can define any helper you like, as long as your
                    submission exposes this exact signature.
                  </p>
                </section>
              </article>
            )}

            {leftTab === 'inputs' && (
              <article className={styles.brief}>
                <header className={styles.briefHead}>
                  <span className={styles.eyebrow}>Visible cases</span>
                  <h1 className={styles.briefTitle}>
                    Test inputs for this challenge
                  </h1>
                  <p className={styles.briefLead}>
                    These are the {TOTAL_CHECKS} inputs the judge checks. Use
                    the list to reproduce the first failing case while you
                    iterate on your lexer.
                  </p>
                </header>

                <div className={styles.fixtureList}>
                  {judgeFixtures.map((fixture, i) => (
                    <section
                      key={`${fixture.label}-${fixture.input}`}
                      className={styles.fixtureRow}
                    >
                      <div className={styles.fixtureHead}>
                        <span className={styles.fixtureIndex}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div className={styles.fixtureMeta}>
                          <strong>{fixture.label}</strong>
                          <span>{fixture.note}</span>
                        </div>
                      </div>
                      <code className={styles.fixtureCode}>
                        {JSON.stringify(fixture.input)}
                      </code>
                    </section>
                  ))}
                </div>
              </article>
            )}
          </div>
        </aside>

        <div
          className={styles.resizerX}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the side panel"
          onPointerDown={startHorizontalDrag}
        >
          <span className={styles.resizerXBar} aria-hidden="true" />
        </div>

        <section className={styles.rightPane}>
          <div className={styles.editorPane}>
            <div className={styles.editorBar}>
              <div className={styles.editorBarLeft}>
                <span className={styles.editorLang}>Haskell</span>
                <span className={styles.editorFile}>Lexer.hs</span>
                <span
                  className={styles.editorRegion}
                  data-tone={allPassed ? 'pass' : 'edit'}
                >
                  {allPassed ? 'solution accepted' : 'template locked'}
                </span>
                {!hasRequiredLexerSignature && (
                  <span className={styles.editorWarning}>
                    missing signature
                  </span>
                )}
              </div>
              <div className={styles.editorBarRight}>
                <span className={styles.editorTemplateHint}>
                  prefix and footer are locked
                </span>
                <span className={styles.editorShortcutHint}>
                  {EDITOR_SHORTCUT_HINT}
                </span>
                <div
                  className={styles.progressTrack}
                  aria-label={`${passedCount} of ${TOTAL_CHECKS} cases`}
                >
                  <span
                    className={styles.progressFill}
                    data-tone={judgeTone}
                    style={{ width: `${judgeProgress}%` }}
                  />
                </div>
                <span className={styles.editorProgressLabel}>
                  {passedCount}/{TOTAL_CHECKS}
                </span>
              </div>
            </div>
            <div
              className={styles.editorFrame}
              onMouseDownCapture={() => editorRef.current?.focus()}
            >
              <Editor
                ref={editorRef}
                onRequestSubmit={() => void requestSubmit()}
              />
            </div>
          </div>

          <div
            className={styles.resizerY}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize the results panel"
            onPointerDown={startVerticalDrag}
          >
            <span className={styles.resizerYBar} aria-hidden="true" />
          </div>

          <div className={styles.bottomPane}>
            <nav className={styles.tabBar} aria-label="Results">
              <button
                type="button"
                className={styles.tab}
                data-active={bottomTab === 'judge'}
                onClick={() => setBottomTab('judge')}
              >
                <ListChecks size={14} strokeWidth={1.75} />
                <span>Judge</span>
                <span className={styles.tabMeta} data-tone={judgeTone}>
                  {testResults.length === 0
                    ? `${TOTAL_CHECKS}`
                    : `${passedCount}/${TOTAL_CHECKS}`}
                </span>
              </button>
              <button
                type="button"
                className={styles.tab}
                data-active={bottomTab === 'stderr'}
                onClick={() => setBottomTab('stderr')}
              >
                <AlertTriangle size={14} strokeWidth={1.75} />
                <span>Stderr</span>
                {hasStderr && (
                  <span
                    className={styles.tabDot}
                    data-tone={stderrIsError ? 'danger' : 'warn'}
                    aria-hidden="true"
                  />
                )}
              </button>

              <div className={styles.tabBarTail}>
                {bottomTab === 'judge' && firstFailure && (
                  <span
                    className={styles.tailNote}
                    title={`first failure: ${firstFailure.name}`}
                  >
                    First failure: <code>{firstFailure.name}</code>
                  </span>
                )}
                {bottomTab === 'judge' && allPassed && (
                  <span className={styles.tailNote}>All checks passed</span>
                )}
              </div>
            </nav>

            <div className={styles.paneBody}>
              {bottomTab === 'judge' && (
                <FixtureChecklist
                  results={testResults}
                  submitStatus={submitStatus}
                  totalChecks={TOTAL_CHECKS}
                />
              )}

              {bottomTab === 'stderr' && (
                <div className={styles.stderrBody}>
                  {!hasStderr ? (
                    <div className={styles.stderrEmpty}>
                      <span className={styles.stderrEmptyDot} />
                      <p>
                        No <code>stderr</code> output yet. Submit your lexer
                        to see compile errors, runtime errors, or platform
                        notices.
                      </p>
                    </div>
                  ) : (
                    <ErrorPanel />
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function focusEditorSoon(editorRef: RefObject<EditorHandle | null>) {
  requestAnimationFrame(() => {
    editorRef.current?.focus()
  })
}
