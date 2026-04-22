{-# LANGUAGE OverloadedStrings #-}

module Email
  ( validateInstitutionalEmail
  ) where

import           Data.Char (isAlphaNum)
import           Data.Text (Text)
import qualified Data.Text as T

validateInstitutionalEmail :: [Text] -> Text -> Either Text Text
validateInstitutionalEmail allowedDomains rawEmail = do
  let normalized = T.toLower (T.strip rawEmail)
      parts = T.splitOn "@" normalized
  case parts of
    [localPart, domain]
      | T.null localPart ->
          Left "Informe um email institucional antes de submeter."
      | T.null domain ->
          Left "Informe um email institucional antes de submeter."
      | not (T.all isLocalChar localPart) ->
          Left "Use um email institucional valido."
      | domain `notElem` allowedDomains ->
          Left "Use seu email institucional @estudante.uffs.edu.br ou @uffs.edu.br."
      | otherwise ->
          Right normalized
    _ ->
      Left "Use um email institucional valido."

isLocalChar :: Char -> Bool
isLocalChar c = isAlphaNum c || c `elem` ("._%+-" :: String)
