import { closeBrackets } from '@codemirror/autocomplete'
import { EditorSelection, EditorState } from '@codemirror/state'
import { indentUnit } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { useLabStore } from '../state/store'
import { localCompletionSource } from './editor/completions'
import {
  buildEditorKeymap,
  editorAutocompleteExtension,
  editorHistoryExtensions,
} from './editor/keymaps'
import { haskellLanguage, haskellLanguageExtensions } from './editor/language'
import { editorThemeExtensions } from './editor/theme'
import styles from './Editor.module.css'

export interface EditorHandle {
  focus: () => void
}

interface EditorProps {
  onRequestSubmit?: () => void
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { onRequestSubmit },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const submitRef = useRef(onRequestSubmit)
  const studentCode = useLabStore((s) => s.studentCode)
  const initialCodeRef = useRef(studentCode)
  const setStudentCode = useLabStore((s) => s.setStudentCode)
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    submitRef.current = onRequestSubmit
  }, [onRequestSubmit])

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        viewRef.current?.focus()
      },
    }),
    [],
  )

  useEffect(() => {
    if (!hostRef.current) return

    const state = EditorState.create({
      doc: initialCodeRef.current,
      extensions: [
        EditorState.tabSize.of(2),
        indentUnit.of('  '),
        ...editorHistoryExtensions(),
        editorAutocompleteExtension(),
        closeBrackets(),
        ...haskellLanguageExtensions,
        haskellLanguage.data.of({
          autocomplete: localCompletionSource,
        }),
        ...editorThemeExtensions,
        buildEditorKeymap(() => submitRef.current?.()),
        EditorView.domEventHandlers({
          blur: () => {
            setIsFocused(false)
          },
          focus: () => {
            setIsFocused(true)
          },
        }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return
          setStudentCode(update.state.doc.toString())
        }),
      ],
    })

    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [setStudentCode])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    syncExternalCode(view, studentCode)
  }, [studentCode])

  return (
    <div
      className={styles.host}
      data-focused={isFocused ? 'true' : 'false'}
    >
      <div ref={hostRef} className={styles.mount} />
    </div>
  )
})

Editor.displayName = 'Editor'

function syncExternalCode(view: EditorView, nextCode: string) {
  const currentCode = view.state.doc.toString()
  if (currentCode === nextCode) return

  const hadFocus = view.hasFocus
  const scrollTop = view.scrollDOM.scrollTop
  const scrollLeft = view.scrollDOM.scrollLeft
  const selection = hadFocus
    ? EditorSelection.create(
        view.state.selection.ranges.map((range) =>
          EditorSelection.range(
            Math.min(range.anchor, nextCode.length),
            Math.min(range.head, nextCode.length),
          ),
        ),
        view.state.selection.mainIndex,
      )
    : undefined

  view.dispatch({
    changes: { from: 0, to: currentCode.length, insert: nextCode },
    scrollIntoView: false,
    selection,
  })

  if (!hadFocus) return
  view.scrollDOM.scrollTop = scrollTop
  view.scrollDOM.scrollLeft = scrollLeft
}
