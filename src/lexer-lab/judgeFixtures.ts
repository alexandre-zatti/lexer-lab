export interface JudgeFixture {
  label: string
  input: string
  note: string
}

// Mirrors the fixtures list in haskell-exec/Judge.hs. Keep both in sync.
export const judgeFixtures: JudgeFixture[] = [
  {
    label: 'Single digit',
    input: '7',
    note: 'One digit should produce TokNum 7.',
  },
  {
    label: 'Maximal munch',
    input: '123',
    note: 'Consecutive digits collapse into a single TokNum.',
  },
  {
    label: 'Simple identifier',
    input: 'abc',
    note: 'Consecutive letters form one TokIdent.',
  },
  {
    label: 'Identifier with digits',
    input: 'x1',
    note: 'After the first letter, digits may extend the identifier.',
  },
  {
    label: 'Number then identifier',
    input: '12abc',
    note: 'The lexer must separate TokNum 12 from TokIdent "abc".',
  },
  {
    label: 'Simple addition',
    input: '1+2',
    note: 'Recognize + without needing surrounding spaces.',
  },
  {
    label: 'Expression with identifiers',
    input: 'x1 + y2 * z3',
    note: 'Mixes identifiers, operators, and spaces.',
  },
  {
    label: 'Simple multiplication',
    input: '2*3',
    note: 'Recognize * without needing surrounding spaces.',
  },
  {
    label: 'Identifier with underscore',
    input: 'foo_bar',
    note: 'Underscores are legal inside an identifier.',
  },
  {
    label: 'Identifier before parentheses',
    input: 'foo(12)',
    note: 'Parentheses still tokenize next to identifiers.',
  },
  {
    label: 'Whitespace at the edges',
    input: '  sum_1 * (x2 + 4)  ',
    note: 'Leading and trailing spaces must not change the tokenization.',
  },
  {
    label: 'Invalid identifier start',
    input: '_tmp',
    note: 'Identifiers must start with a letter; a leading underscore must fail.',
  },
  {
    label: 'Invalid character',
    input: '1 - 2',
    note: 'The `-` character is outside the contract and must fail.',
  },
]
