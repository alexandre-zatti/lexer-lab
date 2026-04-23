{-# LANGUAGE NamedFieldPuns    #-}
{-# LANGUAGE OverloadedStrings #-}

module Config
  ( AppConfig (..)
  , loadConfig
  ) where

import           Data.Maybe   (fromMaybe)
import           Data.Text    (Text)
import qualified Data.Text    as T
import           System.Environment (lookupEnv)
import           Text.Read    (readMaybe)

data AppConfig = AppConfig
  { cfgPort                  :: !Int
  , cfgWorkers               :: !Int
  , cfgTemplatePath          :: !FilePath
  , cfgDbPath                :: !FilePath
  , cfgIpAttemptLimit1m      :: !Int
  , cfgMaxPendingSubmissions :: !Int
  , cfgTrustProxy            :: !Bool
  } deriving (Show)

loadConfig :: IO AppConfig
loadConfig = do
  cfgWorkers <- readEnv "LEXER_LAB_WORKERS" 4
  cfgPort <- readEnv "PORT" 8080
  cfgTemplatePath <- readEnvText "LEXER_LAB_TEMPLATE" "student-template.hs"
  cfgDbPath <- readEnvText "LEXER_LAB_DB_PATH" "/data/lexer-lab.sqlite3"
  cfgIpAttemptLimit1m <- readEnv "LEXER_LAB_IP_ATTEMPT_LIMIT_1M" 120
  cfgMaxPendingSubmissions <- readEnv "LEXER_LAB_MAX_PENDING_SUBMISSIONS" 16
  cfgTrustProxy <- readEnvBool "LEXER_LAB_TRUST_PROXY" False
  pure AppConfig
    { cfgPort
    , cfgWorkers
    , cfgTemplatePath = T.unpack cfgTemplatePath
    , cfgDbPath = T.unpack cfgDbPath
    , cfgIpAttemptLimit1m
    , cfgMaxPendingSubmissions
    , cfgTrustProxy
    }

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
