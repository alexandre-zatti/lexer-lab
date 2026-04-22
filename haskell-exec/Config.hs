{-# LANGUAGE NamedFieldPuns    #-}
{-# LANGUAGE OverloadedStrings #-}

module Config
  ( AppConfig (..)
  , loadConfig
  ) where

import           Data.Int     (Int64)
import           Data.Maybe   (fromMaybe)
import           Data.Text    (Text)
import qualified Data.Text    as T
import           System.Environment (lookupEnv)
import           Text.Read    (readMaybe)

data AppConfig = AppConfig
  { cfgPort                    :: !Int
  , cfgWorkers                 :: !Int
  , cfgTemplatePath            :: !FilePath
  , cfgDbPath                  :: !FilePath
  , cfgAllowedEmailDomains     :: ![Text]
  , cfgEmailCooldownMs         :: !Int64
  , cfgEmailLimit15m           :: !Int
  , cfgEmailLimit1h            :: !Int
  , cfgIpAttemptLimit1m        :: !Int
  , cfgMaxPendingSubmissions   :: !Int
  , cfgTrustProxy              :: !Bool
  } deriving (Show)

loadConfig :: IO AppConfig
loadConfig = do
  cfgWorkers <- readEnv "LEXER_LAB_WORKERS" 4
  cfgPort <- readEnv "PORT" 8080
  cfgTemplatePath <- readEnvText "LEXER_LAB_TEMPLATE" "student-template.hs"
  cfgDbPath <- readEnvText "LEXER_LAB_DB_PATH" "/data/lexer-lab.sqlite3"
  allowedDomainsRaw <-
    readEnvText
      "LEXER_LAB_ALLOWED_EMAIL_DOMAINS"
      "estudante.uffs.edu.br,uffs.edu.br"
  cooldownSeconds <- readEnv "LEXER_LAB_EMAIL_COOLDOWN_SECONDS" (10 :: Int64)
  cfgEmailLimit15m <- readEnv "LEXER_LAB_EMAIL_LIMIT_15M" 45
  cfgEmailLimit1h <- readEnv "LEXER_LAB_EMAIL_LIMIT_1H" 120
  cfgIpAttemptLimit1m <- readEnv "LEXER_LAB_IP_ATTEMPT_LIMIT_1M" 120
  cfgMaxPendingSubmissions <- readEnv "LEXER_LAB_MAX_PENDING_SUBMISSIONS" 16
  cfgTrustProxy <- readEnvBool "LEXER_LAB_TRUST_PROXY" False
  pure AppConfig
    { cfgPort
    , cfgWorkers
    , cfgTemplatePath = T.unpack cfgTemplatePath
    , cfgDbPath = T.unpack cfgDbPath
    , cfgAllowedEmailDomains = parseDomains allowedDomainsRaw
    , cfgEmailCooldownMs = cooldownSeconds * 1000
    , cfgEmailLimit15m
    , cfgEmailLimit1h
    , cfgIpAttemptLimit1m
    , cfgMaxPendingSubmissions
    , cfgTrustProxy
    }

parseDomains :: Text -> [Text]
parseDomains =
  filter (not . T.null)
    . map (T.toLower . T.strip)
    . T.splitOn ","

readEnv :: Read a => String -> a -> IO a
readEnv name def = do
  value <- lookupEnv name
  pure (fromMaybe def (value >>= readMaybe))

readEnvText :: String -> Text -> IO Text
readEnvText name def = do
  value <- lookupEnv name
  pure (maybe def T.pack value)

readEnvBool :: String -> Bool -> IO Bool
readEnvBool name def = do
  value <- lookupEnv name
  pure $ case fmap T.toLower (T.pack <$> value) of
    Just "1"     -> True
    Just "true"  -> True
    Just "yes"   -> True
    Just "on"    -> True
    Just "0"     -> False
    Just "false" -> False
    Just "no"    -> False
    Just "off"   -> False
    _            -> def
