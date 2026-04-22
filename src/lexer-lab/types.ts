export type Token =
  | { kind: 'TokNum'; value: number }
  | { kind: 'TokIdent'; value: string }
  | { kind: 'TokSoma' }
  | { kind: 'TokMult' }
  | { kind: 'TokAbrePar' }
  | { kind: 'TokFechaPar' }

export function tokenLabel(t: Token): string {
  switch (t.kind) {
    case 'TokNum':
      return `TokNum ${t.value}`
    case 'TokIdent':
      return `TokIdent "${t.value}"`
    case 'TokSoma':
      return 'TokSoma'
    case 'TokMult':
      return 'TokMult'
    case 'TokAbrePar':
      return 'TokAbrePar'
    case 'TokFechaPar':
      return 'TokFechaPar'
  }
}
