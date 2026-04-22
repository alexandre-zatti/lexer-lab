import { StreamLanguage } from '@codemirror/language'
import { haskell } from '@codemirror/legacy-modes/mode/haskell'

export const haskellLanguage = StreamLanguage.define(haskell)

export const haskellLanguageExtensions = [
  haskellLanguage,
  haskellLanguage.data.of({
    closeBrackets: {
      brackets: ['(', '[', '{', '"'],
    },
  }),
]
