module Main where

import Data.Char (isAlpha, isAlphaNum, isDigit, isSpace)

data Token = TokNum Int
           | TokIdent String
           | TokSoma
           | TokMult
           | TokAbrePar
           | TokFechaPar
  deriving (Show, Eq)

-- [STUDENT-BEGIN]
-- Tokens esperados: TokNum n, TokIdent nome, TokSoma, TokMult, TokAbrePar, TokFechaPar
lexer :: String -> [Token]

-- [STUDENT-END]
