{-# LANGUAGE NamedFieldPuns    #-}
{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE RecordWildCards   #-}

module Main (main) where

import           ClientInfo                  (requestClientIp, requestUserAgent)
import           Config                      (AppConfig (..), loadConfig)
import           Control.Concurrent.QSem     (QSem, newQSem, signalQSem,
                                              waitQSem)
import           Control.Concurrent.STM      (STM, TVar, atomically, modifyTVar',
                                              newTVarIO, readTVar, writeTVar)
import           Control.Exception           (SomeException, finally, try)
import           Crypto.Hash.SHA256          (hashlazy)
import           Data.Aeson                  (FromJSON (..), ToJSON (..),
                                              eitherDecode, encode, object,
                                              withObject, (.:), (.=))
import qualified Data.ByteString.Base16      as Base16
import qualified Data.ByteString.Lazy        as BL
import           Data.Int                    (Int64)
import           Data.Text                   (Text)
import qualified Data.Text                   as T
import qualified Data.Text.Encoding          as TE
import           Data.Time.Clock             (getCurrentTime)
import           Data.Time.Clock.POSIX       (utcTimeToPOSIXSeconds)
import           HttpError                   (ApiError (..), ErrorCode (..),
                                              apiErrorHeaders, apiErrorStatus)
import           Judge                       (JudgeSummary (..),
                                              RunnerResult (..), TemplateParts,
                                              buildTestProgram, extractJudgeSummary,
                                              extractStudentBody, loadTemplateParts,
                                              runInBwrap)
import           Network.HTTP.Types          (hContentType, status200,
                                              status405)
import           Network.Wai                 (Application, Request, Response,
                                              rawPathInfo, requestMethod,
                                              responseLBS, strictRequestBody)
import           Network.Wai.Handler.Warp    (run)
import           Network.Wai.Middleware.Cors (cors, corsRequestHeaders,
                                              simpleCorsResourcePolicy)
import           Persistence                 (CompletedSubmission (..), Database,
                                              NewSubmission (..), completeSubmission,
                                              createSubmission, loadLimitSnapshot,
                                              openDatabase, runMigrations)
import           RateLimit                   (evaluateRateLimits)

newtype SubmitReq = SubmitReq { reqCode :: Text } deriving (Show)

instance FromJSON SubmitReq where
  parseJSON = withObject "SubmitReq" $ \o -> SubmitReq <$> o .: "code"

data SubmitResp = SubmitResp
  { respSubmissionId :: !Int64
  , respEc           :: !Int
  , respSout         :: !Text
  , respSerr         :: !Text
  , respTimesecs     :: !Double
  } deriving (Show)

instance ToJSON SubmitResp where
  toJSON SubmitResp {..} = object
    [ "submissionId" .= respSubmissionId
    , "ec" .= respEc
    , "sout" .= respSout
    , "serr" .= respSerr
    , "timesecs" .= respTimesecs
    ]

data AppState = AppState
  { appConfig       :: !AppConfig
  , appTemplate     :: !TemplateParts
  , appDb           :: !Database
  , appSem          :: !QSem
  , appPendingCount :: !(TVar Int)
  }

main :: IO ()
main = do
  cfg <- loadConfig
  template <- loadTemplateParts (cfgTemplatePath cfg)
  db <- openDatabase (cfgDbPath cfg)
  runMigrations db
  sem <- newQSem (cfgWorkers cfg)
  pendingCount <- newTVarIO 0
  let state =
        AppState
          { appConfig = cfg
          , appTemplate = template
          , appDb = db
          , appSem = sem
          , appPendingCount = pendingCount
          }
  putStrLn $ unwords
    [ "lexer-lab haskell-exec"
    , "port=" <> show (cfgPort cfg)
    , "workers=" <> show (cfgWorkers cfg)
    , "db=" <> cfgDbPath cfg
    ]
  run (cfgPort cfg) (corsMiddleware (app state))
  where
    corsMiddleware = cors (const (Just policy))
    policy = simpleCorsResourcePolicy
      { corsRequestHeaders = ["Content-Type"] }

app :: AppState -> Application
app state req respond = case (requestMethod req, rawPathInfo req) of
  ("GET", "/healthz") ->
    respond $ responseLBS status200
      [(hContentType, "text/plain; charset=utf-8")]
      "ok\n"
  ("POST", "/submit") ->
    handleSubmit state req respond
  _ ->
    respond $ responseLBS status405
      [(hContentType, "application/json")]
      (encode (object ["err" .= ("method not allowed" :: Text)]))

handleSubmit :: AppState -> Request -> (Response -> IO a) -> IO a
handleSubmit AppState {..} req respond = do
  body <- strictRequestBody req
  nowMs <- currentTimeMs
  let clientIp = requestClientIp (cfgTrustProxy appConfig) req
      userAgent = requestUserAgent req
  case eitherDecode body :: Either String SubmitReq of
    Left _ ->
      respondApiError respond ApiError
        { apiErrorCode = InvalidJson
        , apiErrorMessage = "Invalid submission body."
        , apiErrorRetryAfterMs = Nothing
        }
    Right SubmitReq { reqCode } ->
      case extractStudentBody appTemplate reqCode of
        Left err ->
          respondApiError respond ApiError
            { apiErrorCode = TemplateTamper
            , apiErrorMessage = err
            , apiErrorRetryAfterMs = Nothing
            }
        Right studentBody -> do
          let since1m = nowMs - 60000
          limitSnapshot <- loadLimitSnapshot appDb clientIp since1m
          case evaluateRateLimits appConfig nowMs limitSnapshot of
            Just apiErr ->
              respondApiError respond apiErr
            Nothing -> do
              pendingClaimed <- atomically $
                claimPendingSlot appPendingCount (cfgMaxPendingSubmissions appConfig)
              if not pendingClaimed
                then
                  respondApiError respond ApiError
                    { apiErrorCode = ServerBusy
                    , apiErrorMessage = "The server is busy right now. Try again shortly."
                    , apiErrorRetryAfterMs = Nothing
                    }
                else do
                  let releaseAdmission =
                        atomically (releasePendingSlot appPendingCount)
                  result <- try $ flip finally releaseAdmission $ do
                    submissionId <-
                      createSubmission appDb NewSubmission
                        { newSubmissionClientIp = clientIp
                        , newSubmissionUserAgent = userAgent
                        , newSubmissionReceivedAtMs = nowMs
                        , newSubmissionSourceCode = reqCode
                        , newSubmissionSourceSha256 = sha256Text reqCode
                        }
                    executeSubmission appDb appSem submissionId studentBody
                  case (result :: Either SomeException SubmitResp) of
                    Left _ ->
                      respondApiError respond ApiError
                        { apiErrorCode = WorkerFailure
                        , apiErrorMessage = "Internal error while processing the submission."
                        , apiErrorRetryAfterMs = Nothing
                        }
                    Right submitResp ->
                      respond $ responseLBS status200
                        [(hContentType, "application/json")]
                        (encode submitResp)

executeSubmission :: Database -> QSem -> Int64 -> Text -> IO SubmitResp
executeSubmission db sem submissionId studentBody = do
  let source = buildTestProgram studentBody
  runnerOutcome <-
    (try (waitThenRun sem (runInBwrap source "")) :: IO (Either SomeException RunnerResult))
  completedAtMs <- currentTimeMs
  case runnerOutcome of
    Left err -> do
      let message = T.pack ("worker failure: " <> show err)
      completeSubmission db submissionId CompletedSubmission
        { completedSubmissionCompletedAtMs = completedAtMs
        , completedSubmissionRunnerExitCode = Nothing
        , completedSubmissionRunnerStdout = ""
        , completedSubmissionRunnerStderr = message
        , completedSubmissionExecutionTimeMs = Nothing
        , completedSubmissionJudgeResultsJson = Nothing
        , completedSubmissionPassedCount = Nothing
        , completedSubmissionTotalCount = Nothing
        , completedSubmissionAllPassed = Nothing
        }
      failIO err
    Right runnerResult -> do
      let maybeSummary =
            either (const Nothing) Just (extractJudgeSummary (runnerStdout runnerResult))
      completeSubmission db submissionId CompletedSubmission
        { completedSubmissionCompletedAtMs = completedAtMs
        , completedSubmissionRunnerExitCode = Just (runnerExitCode runnerResult)
        , completedSubmissionRunnerStdout = runnerStdout runnerResult
        , completedSubmissionRunnerStderr = runnerStderr runnerResult
        , completedSubmissionExecutionTimeMs = Just (runnerTimeSecs runnerResult * 1000)
        , completedSubmissionJudgeResultsJson = judgeSummaryJson <$> maybeSummary
        , completedSubmissionPassedCount = judgePassedCount <$> maybeSummary
        , completedSubmissionTotalCount = judgeTotalCount <$> maybeSummary
        , completedSubmissionAllPassed = judgeAllPassed <$> maybeSummary
        }
      pure SubmitResp
        { respSubmissionId = submissionId
        , respEc = runnerExitCode runnerResult
        , respSout = runnerStdout runnerResult
        , respSerr = runnerStderr runnerResult
        , respTimesecs = runnerTimeSecs runnerResult
        }

respondApiError :: (Response -> IO a) -> ApiError -> IO a
respondApiError respond apiErr =
  respond $ responseLBS
    (apiErrorStatus apiErr)
    ([(hContentType, "application/json")] <> apiErrorHeaders apiErr)
    (encode apiErr)

claimPendingSlot :: TVar Int -> Int -> STM Bool
claimPendingSlot var maxPending = do
  pending <- readTVar var
  if pending >= maxPending
    then pure False
    else do
      writeTVar var (pending + 1)
      pure True

releasePendingSlot :: TVar Int -> STM ()
releasePendingSlot var =
  modifyTVar' var (\pending -> max 0 (pending - 1))

waitThenRun :: QSem -> IO a -> IO a
waitThenRun sem action = do
  waitQSem sem
  action `finally` signalQSem sem

currentTimeMs :: IO Int64
currentTimeMs = do
  now <- getCurrentTime
  pure (floor (utcTimeToPOSIXSeconds now * 1000))

sha256Text :: Text -> Text
sha256Text =
  TE.decodeUtf8
    . Base16.encode
    . hashlazy
    . BL.fromStrict
    . TE.encodeUtf8

failIO :: SomeException -> IO a
failIO err = ioError (userError (show err))
