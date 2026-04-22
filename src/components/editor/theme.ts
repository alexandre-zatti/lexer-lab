import { HighlightStyle, bracketMatching, syntaxHighlighting } from '@codemirror/language'
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  lineNumbers,
} from '@codemirror/view'
import { highlightSelectionMatches } from '@codemirror/search'
import { tags as t } from '@lezer/highlight'

const haskellHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword], color: '#85b7ff' },
  { tag: [t.operatorKeyword, t.moduleKeyword], color: '#b8a3ff' },
  { tag: [t.typeName, t.className], color: '#74d7a7' },
  { tag: [t.string, t.character], color: '#ffb454' },
  { tag: [t.number, t.integer, t.float], color: '#ff8dc7' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#596377', fontStyle: 'italic' },
  { tag: [t.operator, t.definitionOperator], color: '#c7ced8' },
  { tag: [t.bracket, t.paren, t.punctuation], color: '#8b94a5' },
  { tag: [t.variableName, t.propertyName, t.labelName], color: '#f2f5f9' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#ffd38f' },
  { tag: [t.bool, t.null, t.atom], color: '#ff8dc7' },
  { tag: t.meta, color: '#7b8496' },
])

export const editorThemeExtensions = [
  lineNumbers(),
  highlightSpecialChars(),
  historySafeSelection(),
  dropCursor(),
  highlightActiveLine(),
  highlightActiveLineGutter(),
  highlightSelectionMatches({
    highlightWordAroundCursor: true,
    minSelectionLength: 1,
  }),
  bracketMatching(),
  syntaxHighlighting(haskellHighlight),
  EditorView.theme(
    {
      '&': {
        backgroundColor: 'transparent',
        color: 'var(--fg-0)',
        height: '100%',
      },
      '.cm-scroller': {
        overflow: 'auto',
        fontFamily: 'var(--font-mono)',
        lineHeight: '1.7',
      },
      '.cm-content': {
        minHeight: '100%',
        padding: '0.9rem 0 1.4rem',
        caretColor: 'var(--accent)',
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
      },
      '.cm-line': {
        paddingInline: '0.95rem 1.4rem',
      },
      '.cm-gutters': {
        backgroundColor: 'rgba(8, 12, 18, 0.88)',
        borderRight: '1px solid var(--line)',
        color: 'var(--fg-3)',
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        paddingRight: '0.25rem',
      },
      '.cm-lineNumbers .cm-gutterElement': {
        minWidth: '2.3rem',
        padding: '0 0.65rem 0 0.6rem',
        transition: 'color 120ms ease',
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(255, 255, 255, 0.028)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'rgba(var(--accent-rgb), 0.12)',
        color: 'var(--fg-0)',
        fontWeight: '600',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-selectionBackground': {
        backgroundColor: 'rgba(var(--accent-rgb), 0.18)',
      },
      '.cm-selectionMatch': {
        backgroundColor: 'rgba(var(--accent-rgb), 0.1)',
        borderRadius: '4px',
      },
      '.cm-selectionMatch-main': {
        backgroundColor: 'rgba(var(--accent-rgb), 0.14)',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--accent)',
        borderLeftWidth: '2px',
      },
      '.cm-matchingBracket': {
        backgroundColor: 'rgba(var(--accent-rgb), 0.14)',
        color: 'var(--accent-ink)',
        outline: '1px solid rgba(var(--accent-rgb), 0.32)',
        borderRadius: '4px',
      },
      '.cm-nonmatchingBracket': {
        backgroundColor: 'rgba(239, 83, 80, 0.12)',
        color: 'var(--danger-ink)',
        outline: '1px solid rgba(239, 83, 80, 0.25)',
        borderRadius: '4px',
      },
      '.cm-tooltip': {
        border: '1px solid var(--line-strong)',
        backgroundColor: 'rgba(12, 16, 24, 0.98)',
        borderRadius: '12px',
        boxShadow: '0 18px 40px rgba(0, 0, 0, 0.35)',
        overflow: 'hidden',
      },
      '.cm-tooltip-autocomplete > ul': {
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        maxHeight: '280px',
        padding: '0.35rem',
      },
      '.cm-tooltip-autocomplete ul li': {
        alignItems: 'center',
        borderRadius: '8px',
        color: 'var(--fg-1)',
        gap: '0.55rem',
        padding: '0.45rem 0.6rem',
      },
      '.cm-tooltip-autocomplete ul li[aria-selected]': {
        backgroundColor: 'rgba(var(--accent-rgb), 0.12)',
        color: 'var(--fg-0)',
      },
      '.cm-completionLabel': {
        color: 'inherit',
      },
      '.cm-completionMatchedText': {
        color: 'var(--accent-ink)',
        textDecoration: 'none',
        fontWeight: '700',
      },
      '.cm-completionDetail': {
        color: 'var(--fg-3)',
        marginLeft: 'auto',
        fontStyle: 'normal',
      },
      '.cm-completionInfo': {
        padding: '0.65rem 0.8rem',
        borderLeft: '1px solid var(--line)',
        color: 'var(--fg-2)',
        backgroundColor: 'rgba(17, 22, 30, 0.98)',
      },
      '.cm-panels': {
        backgroundColor: 'var(--bg-1)',
      },
    },
    { dark: true },
  ),
] as const

function historySafeSelection() {
  return drawSelection()
}
