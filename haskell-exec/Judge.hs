{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE RecordWildCards   #-}

module Judge
  ( JudgeSummary (..)
  , RunnerResult (..)
  , TemplateParts (..)
  , buildTestProgram
  , extractJudgeSummary
  , extractStudentBody
  , loadTemplateParts
  , runInBwrap
  ) where

import           Data.Aeson            (FromJSON (..), eitherDecodeStrict',
                                        withObject, (.:))
import qualified Data.ByteString.Lazy  as BL
import           Data.Text             (Text)
import qualified Data.Text             as T
import qualified Data.Text.Encoding    as TE
import qualified Data.Text.IO          as TIO
import           Data.Time.Clock       (diffUTCTime, getCurrentTime)
import           System.Exit           (ExitCode (..))
import           System.FilePath       ((</>))
import           System.IO             (IOMode (WriteMode), hPutStr, withFile)
import           System.IO.Temp        (withSystemTempDirectory)
import           System.Process.Typed  (byteStringInput, proc, readProcess,
                                        setStdin)

data RunnerResult = RunnerResult
  { runnerExitCode :: !Int
  , runnerStdout   :: !Text
  , runnerStderr   :: !Text
  , runnerTimeSecs :: !Double
  } deriving (Show)

data TemplateParts = TemplateParts
  { tmplPrefix :: !Text
  , tmplSuffix :: !Text
  } deriving (Show)

data JudgeSummary = JudgeSummary
  { judgeSummaryJson :: !Text
  , judgePassedCount :: !Int
  , judgeTotalCount  :: !Int
  , judgeAllPassed   :: !Bool
  } deriving (Eq, Show)

data JudgePayload = JudgePayload
  { payloadResults :: ![JudgeResult]
  } deriving (Show)

data JudgeResult = JudgeResult
  { resultOk :: !Bool
  } deriving (Show)

instance FromJSON JudgePayload where
  parseJSON = withObject "JudgePayload" $ \o ->
    JudgePayload <$> o .: "results"

instance FromJSON JudgeResult where
  parseJSON = withObject "JudgeResult" $ \o ->
    JudgeResult <$> o .: "ok"

beginMarker, endMarker :: Text
beginMarker = "-- [STUDENT-BEGIN]"
endMarker = "-- [STUDENT-END]"

loadTemplateParts :: FilePath -> IO TemplateParts
loadTemplateParts path = do
  source <- TIO.readFile path
  case splitTemplate source of
    Left err -> fail ("failed to parse student template: " <> T.unpack err)
    Right parts -> pure parts

splitTemplate :: Text -> Either Text TemplateParts
splitTemplate source = do
  let (beforeBegin, beginAndRest) = T.breakOn beginMarker source
  if T.null beginAndRest
    then Left "missing begin marker"
    else do
      let afterBeginMarker = T.drop (T.length beginMarker) beginAndRest
      afterBegin <- case T.uncons afterBeginMarker of
        Just ('\n', rest) -> Right rest
        _                 -> Left "begin marker must be followed by newline"
      let (_, endAndRest) = T.breakOn endMarker afterBegin
      if T.null endAndRest
        then Left "missing end marker"
        else
          Right TemplateParts
            { tmplPrefix = beforeBegin <> beginMarker <> "\n"
            , tmplSuffix = endAndRest
            }

extractStudentBody :: TemplateParts -> Text -> Either Text Text
extractStudentBody TemplateParts {..} code
  | not (tmplPrefix `T.isPrefixOf` code) =
      Left "o cabeçalho protegido foi alterado; restaure o template original"
  | not (tmplSuffix `T.isSuffixOf` code) =
      Left "o rodapé protegido foi alterado; restaure o template original"
  | otherwise =
      Right
        (T.drop (T.length tmplPrefix)
          (T.take (T.length code - T.length tmplSuffix) code))

extractJudgeSummary :: Text -> Either Text JudgeSummary
extractJudgeSummary stdoutText = do
  body <- extractSentinelJson stdoutText
  payload <- firstError "invalid judge json" (eitherDecodeStrict' (TE.encodeUtf8 body))
  let passedCount = length (filter resultOk (payloadResults payload))
      totalCount = length (payloadResults payload)
  pure JudgeSummary
    { judgeSummaryJson = body
    , judgePassedCount = passedCount
    , judgeTotalCount = totalCount
    , judgeAllPassed = totalCount > 0 && passedCount == totalCount
    }

extractSentinelJson :: Text -> Either Text Text
extractSentinelJson stdoutText = do
  let (_, afterBegin) = T.breakOn sentBegin stdoutText
  if T.null afterBegin
    then Left "missing begin sentinel"
    else do
      let bodyStart = T.drop (T.length sentBegin) afterBegin
          (body, rest) = T.breakOn sentEnd bodyStart
      if T.null rest
        then Left "missing end sentinel"
        else Right (T.strip body)
  where
    sentBegin = "---LEXER-JSON-BEGIN---"
    sentEnd = "---LEXER-JSON-END---"

runInBwrap :: Text -> Text -> IO RunnerResult
runInBwrap src stdinIn =
  withSystemTempDirectory "lexer-lab-" $ \workdir -> do
    let srcPath = workdir </> "Main.hs"
    withFile srcPath WriteMode $ \h -> hPutStr h (T.unpack src)
    t0 <- getCurrentTime
    primaryResult <- runBwrapWithArgs (bwrapArgsWithUserns workdir) stdinIn
    runnerResult <-
      if shouldRetryWithoutUserns primaryResult
        then runBwrapWithArgs (bwrapArgsWithoutUserns workdir) stdinIn
        else pure primaryResult
    t1 <- getCurrentTime
    let dt = realToFrac (diffUTCTime t1 t0) :: Double
    pure runnerResult { runnerTimeSecs = dt }

runBwrapWithArgs :: [String] -> Text -> IO RunnerResult
runBwrapWithArgs bwrapArgs stdinIn = do
  let pc = setStdin (byteStringInput (BL.fromStrict (TE.encodeUtf8 stdinIn)))
        (proc "bwrap" bwrapArgs)
  (xc, outLBS, errLBS) <- readProcess pc
  pure RunnerResult
    { runnerExitCode = case xc of
        ExitSuccess   -> 0
        ExitFailure n -> n
    , runnerStdout = TE.decodeUtf8 (BL.toStrict outLBS)
    , runnerStderr = TE.decodeUtf8 (BL.toStrict errLBS)
    , runnerTimeSecs = 0
    }

bwrapArgsWithUserns :: FilePath -> [String]
bwrapArgsWithUserns workdir =
  commonBwrapArgs workdir
    [ "--unshare-user"
    , "--unshare-net"
    , "--unshare-ipc"
    , "--unshare-uts"
    ]

bwrapArgsWithoutUserns :: FilePath -> [String]
bwrapArgsWithoutUserns workdir =
  commonBwrapArgs workdir
    [ "--unshare-net"
    , "--unshare-ipc"
    , "--unshare-uts"
    , "--cap-drop", "ALL"
    ]

commonBwrapArgs :: FilePath -> [String] -> [String]
commonBwrapArgs workdir namespaceArgs =
  namespaceArgs
    <> [ "--new-session"
       , "--die-with-parent"
       , "--ro-bind", "/", "/"
       , "--tmpfs", "/tmp"
       , "--bind", workdir, "/tmp/work"
       , "--dev", "/dev"
       , "--chdir", "/tmp/work"
       , "--setenv", "HOME", "/tmp"
       , "--setenv", "PATH", "/opt/ghc/9.6.7/bin:/usr/local/bin:/usr/bin:/bin"
       , "--setenv", "LC_ALL", "C.UTF-8"
       , "--setenv", "LANG", "C.UTF-8"
       , "--"
       , "timeout", "5s"
       , "runghc", "Main.hs"
       ]

shouldRetryWithoutUserns :: RunnerResult -> Bool
shouldRetryWithoutUserns RunnerResult { runnerExitCode, runnerStderr } =
  runnerExitCode /= 0
    && any (`T.isInfixOf` runnerStderr)
      [ "Failed to make / slave: Permission denied"
      , "No permissions to create new namespace"
      , "No permissions to create new user namespace"
      ]

buildRunnerPreamble :: Text -> Text
buildRunnerPreamble studentBody =
  T.unlines
    [ "module Main where"
    , ""
    , "import Control.Exception (SomeException, evaluate, try)"
    , "import Data.Char (isAlpha, isAlphaNum, isDigit, isSpace)"
    , "import Data.List (intercalate)"
    , "import qualified System.IO"
    , ""
    , "data Token = TokNum Int"
    , "           | TokIdent String"
    , "           | TokSoma"
    , "           | TokMult"
    , "           | TokAbrePar"
    , "           | TokFechaPar"
    , "  deriving (Show, Eq)"
    , ""
    , T.stripEnd studentBody
    , ""
    ]

jsonSupport :: Text
jsonSupport = T.unlines
  [ "jString :: String -> String"
  , "jString s = \"\\\"\" ++ concatMap esc s ++ \"\\\"\""
  , "  where"
  , "    esc '\"'  = \"\\\\\\\"\""
  , "    esc '\\\\' = \"\\\\\\\\\""
  , "    esc '\\n' = \"\\\\n\""
  , "    esc '\\r' = \"\\\\r\""
  , "    esc '\\t' = \"\\\\t\""
  , "    esc c"
  , "      | c < ' '   = \"\\\\u\" ++ padHex (fromEnum c)"
  , "      | otherwise = [c]"
  , ""
  , "    padHex n = let h = showHex n in replicate (4 - length h) '0' ++ h"
  , "    showHex 0 = \"0\""
  , "    showHex n = go n \"\""
  , "      where"
  , "        go 0 acc = acc"
  , "        go m acc = let (q, r) = m `divMod` 16"
  , "                       d      = \"0123456789abcdef\" !! r"
  , "                   in go q (d : acc)"
  , ""
  , "jObj :: [(String, String)] -> String"
  , "jObj kvs = \"{\" ++ intercalate \",\" [jString k ++ \":\" ++ v | (k, v) <- kvs] ++ \"}\""
  , ""
  , "jArr :: [String] -> String"
  , "jArr xs = \"[\" ++ intercalate \",\" xs ++ \"]\""
  , ""
  , "jBool :: Bool -> String"
  , "jBool True  = \"true\""
  , "jBool False = \"false\""
  , ""
  , "jInt :: Int -> String"
  , "jInt = show"
  , ""
  , "jToken :: Token -> String"
  , "jToken (TokNum n)   = jObj [(\"kind\", jString \"TokNum\"), (\"value\", jInt n)]"
  , "jToken (TokIdent s) = jObj [(\"kind\", jString \"TokIdent\"), (\"value\", jString s)]"
  , "jToken TokSoma      = jObj [(\"kind\", jString \"TokSoma\")]"
  , "jToken TokMult      = jObj [(\"kind\", jString \"TokMult\")]"
  , "jToken TokAbrePar   = jObj [(\"kind\", jString \"TokAbrePar\")]"
  , "jToken TokFechaPar  = jObj [(\"kind\", jString \"TokFechaPar\")]"
  , ""
  ]

commonRuntimeSupport :: Text
commonRuntimeSupport = T.unlines
  [ "normalizeError :: String -> String"
  , "normalizeError = takeWhile (/= '\\n')"
  , ""
  , "forceToken :: Token -> ()"
  , "forceToken (TokNum n) = n `seq` ()"
  , "forceToken (TokIdent s) = s `seq` ()"
  , "forceToken TokSoma = ()"
  , "forceToken TokMult = ()"
  , "forceToken TokAbrePar = ()"
  , "forceToken TokFechaPar = ()"
  , ""
  , "forceTokens :: [Token] -> ()"
  , "forceTokens [] = ()"
  , "forceTokens (t:ts) = forceToken t `seq` forceTokens ts"
  , ""
  , "safeRun :: (String -> [Token]) -> String -> IO (Either String [Token])"
  , "safeRun f input = do"
  , "  result <- (try (evaluate (let tokens = f input in forceTokens tokens `seq` tokens)) :: IO (Either SomeException [Token]))"
  , "  pure $ case result of"
  , "    Left e -> Left (normalizeError (show e))"
  , "    Right tokens -> Right tokens"
  , ""
  , "referenceLexer :: String -> [Token]"
  , "referenceLexer [] = []"
  , "referenceLexer (c:cs)"
  , "  | isSpace c = referenceLexer cs"
  , "  | isDigit c = referenceLexNum (c:cs)"
  , "  | isAlpha c = referenceLexIdent (c:cs)"
  , "  | c == '+' = TokSoma : referenceLexer cs"
  , "  | c == '*' = TokMult : referenceLexer cs"
  , "  | c == '(' = TokAbrePar : referenceLexer cs"
  , "  | c == ')' = TokFechaPar : referenceLexer cs"
  , "  | otherwise = error \"caractere inválido\""
  , ""
  , "referenceLexNum :: String -> [Token]"
  , "referenceLexNum cs = TokNum (read n) : referenceLexer r"
  , "  where"
  , "    (n, r) = span isDigit cs"
  , ""
  , "referenceLexIdent :: String -> [Token]"
  , "referenceLexIdent cs = TokIdent ident : referenceLexer r"
  , "  where"
  , "    (ident, r) = span isIdentChar cs"
  , ""
  , "isIdentChar :: Char -> Bool"
  , "isIdentChar c = isAlphaNum c || c == '_'"
  , ""
  ]

testSupport :: Text
testSupport = T.unlines
  [ "data Outcome = OutcomeTokens [Token] | OutcomeError String"
  , ""
  , "outcomeMatches :: Outcome -> Outcome -> Bool"
  , "outcomeMatches (OutcomeTokens a) (OutcomeTokens b) = a == b"
  , "outcomeMatches (OutcomeError _) (OutcomeError _) = True"
  , "outcomeMatches _ _ = False"
  , ""
  , "jOutcome :: Outcome -> String"
  , "jOutcome (OutcomeTokens tokens) = jObj [(\"kind\", jString \"tokens\"), (\"tokens\", jArr (map jToken tokens))]"
  , "jOutcome (OutcomeError msg) = jObj [(\"kind\", jString \"error\"), (\"message\", jString msg)]"
  , ""
  , "data Fixture = Fixture String String"
  , ""
  , "fixtures :: [Fixture]"
  , "fixtures ="
  , "  [ Fixture \"Número de um dígito\" \"7\""
  , "  , Fixture \"Max-munch: 123\" \"123\""
  , "  , Fixture \"Identificador simples\" \"abc\""
  , "  , Fixture \"Identificador com dígitos\" \"x1\""
  , "  , Fixture \"Número seguido de identificador\" \"12abc\""
  , "  , Fixture \"Soma simples\" \"1+2\""
  , "  , Fixture \"Expressão com identificadores\" \"x1 + y2 * z3\""
  , "  , Fixture \"Multiplicação simples\" \"2*3\""
  , "  , Fixture \"Identificador com underscore\" \"foo_bar\""
  , "  , Fixture \"Identificador antes de parênteses\" \"foo(12)\""
  , "  , Fixture \"Espaços nas bordas\" \"  soma_1 * (x2 + 4)  \""
  , "  , Fixture \"Início inválido de identificador\" \"_tmp\""
  , "  , Fixture \"Rejeita char inválido\" \"1 - 2\""
  , "  ]"
  , ""
  , "data Result = Result String String Outcome Outcome Bool"
  , ""
  , "jResult :: Result -> String"
  , "jResult (Result name input expected got ok) ="
  , "  jObj"
  , "    [ (\"name\", jString name)"
  , "    , (\"input\", jString input)"
  , "    , (\"expected\", jOutcome expected)"
  , "    , (\"got\", jOutcome got)"
  , "    , (\"ok\", jBool ok)"
  , "    ]"
  , ""
  , "toOutcome :: Either String [Token] -> Outcome"
  , "toOutcome (Left msg) = OutcomeError msg"
  , "toOutcome (Right tokens) = OutcomeTokens tokens"
  , ""
  , "runFixture :: Fixture -> IO Result"
  , "runFixture (Fixture name input) = do"
  , "  expected <- toOutcome <$> safeRun referenceLexer input"
  , "  got <- toOutcome <$> safeRun lexer input"
  , "  pure (Result name input expected got (outcomeMatches expected got))"
  , ""
  , "main :: IO ()"
  , "main = do"
  , "  results <- mapM runFixture fixtures"
  , "  putStrLn \"---LEXER-JSON-BEGIN---\""
  , "  putStrLn (jObj [(\"results\", jArr (map jResult results))])"
  , "  putStrLn \"---LEXER-JSON-END---\""
  ]

buildTestProgram :: Text -> Text
buildTestProgram studentBody =
  T.concat
    [ buildRunnerPreamble studentBody
    , jsonSupport
    , commonRuntimeSupport
    , testSupport
    ]

firstError :: Text -> Either String a -> Either Text a
firstError label (Left err) = Left (label <> ": " <> T.pack err)
firstError _ (Right value)  = Right value
