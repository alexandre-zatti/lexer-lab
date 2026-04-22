export interface JudgeFixture {
  label: string
  input: string
  note: string
}

// Mirror of the judge fixtures defined in haskell-exec/Server.hs.
export const judgeFixtures: JudgeFixture[] = [
  {
    label: 'Número simples',
    input: '7',
    note: 'Um único dígito deve produzir TokNum 7.',
  },
  {
    label: 'Maximal munch',
    input: '123',
    note: 'Todos os dígitos consecutivos precisam virar um único token.',
  },
  {
    label: 'Identificador simples',
    input: 'abc',
    note: 'Letras consecutivas devem virar um único TokIdent.',
  },
  {
    label: 'Identificador com dígitos',
    input: 'x1',
    note: 'Depois da primeira letra, dígitos também podem entrar no identificador.',
  },
  {
    label: 'Número seguido de identificador',
    input: '12abc',
    note: 'O lexer precisa separar TokNum 12 de TokIdent "abc".',
  },
  {
    label: 'Soma simples',
    input: '1+2',
    note: 'Reconhece + sem depender de espaços.',
  },
  {
    label: 'Expressão com identificadores',
    input: 'x1 + y2 * z3',
    note: 'Mistura identificadores, operadores e espaços.',
  },
  {
    label: 'Multiplicação simples',
    input: '2*3',
    note: 'Reconhece * sem depender de espaços.',
  },
  {
    label: 'Identificador com underscore',
    input: 'foo_bar',
    note: 'O underscore pode aparecer dentro do identificador.',
  },
  {
    label: 'Identificador antes de parênteses',
    input: 'foo(12)',
    note: 'Parênteses continuam funcionando ao lado de identificadores.',
  },
  {
    label: 'Espaços nas bordas',
    input: '  soma_1 * (x2 + 4)  ',
    note: 'Espaços nas bordas não podem alterar a tokenização.',
  },
  {
    label: 'Início inválido de identificador',
    input: '_tmp',
    note: 'Identificadores devem começar com letra; underscore inicial deve falhar.',
  },
  {
    label: 'Caractere inválido',
    input: '1 - 2',
    note: 'Este caso deve falhar por causa do -.',
  },
]
