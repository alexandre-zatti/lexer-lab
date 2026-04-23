module Main where

import Data.Char (isAlpha, isAlphaNum, isDigit, isSpace)

data Token = TokNum Int
           | TokIdent String
           | TokPlus
           | TokStar
           | TokLParen
           | TokRParen
  deriving (Show, Eq)

-- [STUDENT-BEGIN]
-- Expected tokens: TokNum n, TokIdent name, TokPlus, TokStar, TokLParen, TokRParen
lexer :: String -> [Token]

-- [STUDENT-END]
