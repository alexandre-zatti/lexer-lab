import {
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'

const WORD_RE = /[A-Za-z_][A-Za-z0-9_']*$/

const completionEntries: Completion[] = [
  {
    label: 'TokNum',
    type: 'class',
    detail: 'token constructor',
    info: 'TokNum n represents an integer literal.',
  },
  {
    label: 'TokIdent',
    type: 'class',
    detail: 'token constructor',
    info: 'TokIdent name represents an identifier that starts with a letter.',
  },
  {
    label: 'TokPlus',
    type: 'constant',
    detail: 'token constructor',
    info: 'Token emitted for the `+` symbol.',
  },
  {
    label: 'TokStar',
    type: 'constant',
    detail: 'token constructor',
    info: 'Token emitted for the `*` symbol.',
  },
  {
    label: 'TokLParen',
    type: 'constant',
    detail: 'token constructor',
    info: 'Token emitted for the `(` symbol.',
  },
  {
    label: 'TokRParen',
    type: 'constant',
    detail: 'token constructor',
    info: 'Token emitted for the `)` symbol.',
  },
  {
    label: 'isDigit',
    type: 'function',
    detail: 'Data.Char',
    info: 'True when the character is a digit.',
  },
  {
    label: 'isAlpha',
    type: 'function',
    detail: 'Data.Char',
    info: 'True when the character is a letter.',
  },
  {
    label: 'isAlphaNum',
    type: 'function',
    detail: 'Data.Char',
    info: 'True when the character is a letter or a digit.',
  },
  {
    label: 'isSpace',
    type: 'function',
    detail: 'Data.Char',
    info: 'True when the character is whitespace.',
  },
  {
    label: 'lexer',
    type: 'function',
    detail: 'challenge',
    info: 'The function your submission must define.',
  },
  {
    label: 'error',
    type: 'function',
    detail: 'Prelude',
    info: 'Use it to fail when an invalid character appears.',
  },
  {
    label: 'span',
    type: 'function',
    detail: 'Prelude',
    info: 'Splits off the longest prefix matching a predicate.',
  },
  { label: 'case', type: 'keyword' },
  { label: 'of', type: 'keyword' },
  { label: 'let', type: 'keyword' },
  { label: 'in', type: 'keyword' },
  { label: 'if', type: 'keyword' },
  { label: 'then', type: 'keyword' },
  { label: 'else', type: 'keyword' },
  { label: 'where', type: 'keyword' },
  snippetCompletion('case ${value} of\n  ${pattern} -> ${result}', {
    label: 'case/of',
    type: 'keyword',
    detail: 'snippet',
    info: 'Basic pattern-matching structure.',
  }),
  snippetCompletion(
    '${name} ${args}\n  | ${condition} = ${result}\n  | otherwise = ${fallback}',
    {
      label: 'guards',
      type: 'keyword',
      detail: 'snippet',
      info: 'Skeleton for a definition with guards.',
    },
  ),
  snippetCompletion(
    'lexer (${c}:${cs})\n  | isSpace ${c} = lexer ${cs}\n  | isDigit ${c} = ${lexNumber}\n  | isAlpha ${c} = ${lexIdent}\n  | otherwise = ${fallback}',
    {
      label: 'lexer (c:cs)',
      type: 'function',
      detail: 'snippet',
      info: 'Recursion skeleton with branches for numbers and identifiers.',
    },
  ),
  snippetCompletion(
    'lexIdent ${cs} = TokIdent ${name} : lexer ${rest}\n  where\n    (${name}, ${rest}) = span ${predicate} ${cs}',
    {
      label: 'lexIdent',
      type: 'function',
      detail: 'snippet',
      info: 'Skeleton for consuming an identifier with maximal munch.',
    },
  ),
]

export function localCompletionSource(
  context: CompletionContext,
): CompletionResult | null {
  const word = context.matchBefore(WORD_RE)
  if (!context.explicit && (!word || word.from === word.to)) {
    return null
  }

  const query = word?.text.toLowerCase() ?? ''
  const options =
    query.length === 0
      ? completionEntries
      : completionEntries.filter((entry) =>
          entry.label.toLowerCase().startsWith(query),
        )

  if (options.length === 0) return null

  return {
    from: word?.from ?? context.pos,
    options,
    validFor: /^[A-Za-z_][A-Za-z0-9_']*$/,
  }
}
