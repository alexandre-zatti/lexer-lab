import { closeBrackets } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { indentUnit } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { lockedEditorExtensions } from '../lexer-lab/editorLocks'
import {
  extractStudentBody,
  mergeStudentBody,
  studentTemplate,
} from '../lexer-lab/template'
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
  const initialCodeRef = useRef(mergeStudentBody(studentCode))
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
        ...lockedEditorExtensions(),
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
          const nextStudentCode = extractStudentBody(update.state.doc.toString())
          if (nextStudentCode !== null) setStudentCode(nextStudentCode)
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
  const currentDoc = view.state.doc.toString()
  const nextDoc = mergeStudentBody(nextCode)
  if (currentDoc === nextDoc) return
  if (extractStudentBody(currentDoc) === nextCode) return

  const editableFrom = studentTemplate.editableFrom
  const editableTo = currentDoc.length - studentTemplate.suffix.length
  const scrollTop = view.scrollDOM.scrollTop
  const scrollLeft = view.scrollDOM.scrollLeft

  view.dispatch({
    changes: { from: editableFrom, to: editableTo, insert: nextCode },
    scrollIntoView: false,
  })

  view.scrollDOM.scrollTop = scrollTop
  view.scrollDOM.scrollLeft = scrollLeft
}
