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
    info: 'TokNum n representa um número inteiro lido da entrada.',
  },
  {
    label: 'TokIdent',
    type: 'class',
    detail: 'token constructor',
    info: 'TokIdent nome representa um identificador iniciado por letra.',
  },
  {
    label: 'TokSoma',
    type: 'constant',
    detail: 'token constructor',
    info: 'Token emitido para o símbolo +.',
  },
  {
    label: 'TokMult',
    type: 'constant',
    detail: 'token constructor',
    info: 'Token emitido para o símbolo *.',
  },
  {
    label: 'TokAbrePar',
    type: 'constant',
    detail: 'token constructor',
    info: 'Token emitido para o símbolo (.',
  },
  {
    label: 'TokFechaPar',
    type: 'constant',
    detail: 'token constructor',
    info: 'Token emitido para o símbolo ).',
  },
  {
    label: 'isDigit',
    type: 'function',
    detail: 'Data.Char',
    info: 'Verifica se um caractere é dígito.',
  },
  {
    label: 'isAlpha',
    type: 'function',
    detail: 'Data.Char',
    info: 'Verifica se um caractere é letra.',
  },
  {
    label: 'isAlphaNum',
    type: 'function',
    detail: 'Data.Char',
    info: 'Verifica se um caractere é letra ou dígito.',
  },
  {
    label: 'isSpace',
    type: 'function',
    detail: 'Data.Char',
    info: 'Verifica se um caractere é espaço em branco.',
  },
  {
    label: 'lexer',
    type: 'function',
    detail: 'atividade',
    info: 'Função obrigatória da submissão.',
  },
  {
    label: 'error',
    type: 'function',
    detail: 'Prelude',
    info: 'Use para falhar quando surgir um caractere inválido.',
  },
  {
    label: 'span',
    type: 'function',
    detail: 'Prelude',
    info: 'Separa o prefixo que satisfaz um predicado.',
  },
  {
    label: 'case',
    type: 'keyword',
  },
  {
    label: 'of',
    type: 'keyword',
  },
  {
    label: 'let',
    type: 'keyword',
  },
  {
    label: 'in',
    type: 'keyword',
  },
  {
    label: 'if',
    type: 'keyword',
  },
  {
    label: 'then',
    type: 'keyword',
  },
  {
    label: 'else',
    type: 'keyword',
  },
  {
    label: 'where',
    type: 'keyword',
  },
  snippetCompletion('case ${value} of\n  ${pattern} -> ${result}', {
    label: 'case/of',
    type: 'keyword',
    detail: 'snippet',
    info: 'Estrutura básica para fazer pattern matching.',
  }),
  snippetCompletion(
    '${name} ${args}\n  | ${condition} = ${result}\n  | otherwise = ${fallback}',
    {
      label: 'guards',
      type: 'keyword',
      detail: 'snippet',
      info: 'Esqueleto para definição com guardas.',
    },
  ),
  snippetCompletion(
    'lexer (${c}:${cs})\n  | isSpace ${c} = lexer ${cs}\n  | isDigit ${c} = ${lexNumber}\n  | isAlpha ${c} = ${lexIdent}\n  | otherwise = ${fallback}',
    {
      label: 'lexer (c:cs)',
      type: 'function',
      detail: 'snippet',
      info: 'Esqueleto de recursão com ramos para números e identificadores.',
    },
  ),
  snippetCompletion(
    'lexIdent ${cs} = TokIdent ${name} : lexer ${rest}\n  where\n    (${name}, ${rest}) = span ${predicate} ${cs}',
    {
      label: 'lexIdent',
      type: 'function',
      detail: 'snippet',
      info: 'Esqueleto para consumir um identificador com maximal munch.',
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
