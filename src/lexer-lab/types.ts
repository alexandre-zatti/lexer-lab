export type Token =
  | { kind: 'TokNum'; value: number }
  | { kind: 'TokIdent'; value: string }
  | { kind: 'TokPlus' }
  | { kind: 'TokStar' }
  | { kind: 'TokLParen' }
  | { kind: 'TokRParen' }

export function tokenLabel(t: Token): string {
  switch (t.kind) {
    case 'TokNum':
      return `TokNum ${t.value}`
    case 'TokIdent':
      return `TokIdent "${t.value}"`
    case 'TokPlus':
      return 'TokPlus'
    case 'TokStar':
      return 'TokStar'
    case 'TokLParen':
      return 'TokLParen'
    case 'TokRParen':
      return 'TokRParen'
  }
}
