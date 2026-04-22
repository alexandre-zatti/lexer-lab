import {
  autocompletion,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  temporarilySetTabFocusMode,
} from '@codemirror/commands'
import { keymap, type KeyBinding } from '@codemirror/view'

export function editorHistoryExtensions() {
  return [history()]
}

export function editorAutocompleteExtension() {
  return autocompletion({
    activateOnTyping: true,
    defaultKeymap: false,
    icons: false,
    maxRenderedOptions: 8,
  })
}

export function buildEditorKeymap(
  onRequestSubmit?: () => void,
): ReturnType<typeof keymap.of> {
  const priorityKeymap: KeyBinding[] = [
    {
      key: 'Mod-Enter',
      run: () => {
        onRequestSubmit?.()
        return true
      },
    },
  ]

  const editingKeymap: KeyBinding[] = [
    {
      key: 'Escape',
      run: temporarilySetTabFocusMode,
    },
    indentWithTab,
  ]

  return keymap.of([
    ...priorityKeymap,
    ...completionKeymap,
    ...closeBracketsKeymap,
    ...editingKeymap,
    ...historyKeymap,
    ...defaultKeymap,
  ])
}
