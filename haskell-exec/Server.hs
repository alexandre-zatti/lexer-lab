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
                                              Value, eitherDecode, encode,
                                              object, withObject, (.:), (.=))
import qualified Data.ByteString.Base16      as Base16
import qualified Data.ByteString.Lazy        as BL
import           Data.Int                    (Int64)
import           Data.Set                    (Set)
import qualified Data.Set                    as Set
import           Data.Text                   (Text)
import qualified Data.Text                   as T
import qualified Data.Text.Encoding          as TE
import           Data.Time.Clock             (getCurrentTime)
import           Data.Time.Clock.POSIX       (utcTimeToPOSIXSeconds)
import           Email                       (validateInstitutionalEmail)
import           HttpError                   (ApiError (..), ErrorCode (..),
                                              apiErrorHeaders, apiErrorStatus,
                                              errorCodeText)
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
import           Persistence                 (AbuseEvent (..),
                                              CompletedSubmission (..), Database,
                                              LimitSnapshot (..),
                                              NewSubmission (..), completeSubmission,
                                              createSubmission, loadLimitSnapshot,
                                              logAbuseEvent, openDatabase,
                                              runMigrations)
import           RateLimit                   (evaluateRateLimits)

data SubmitReq = SubmitReq
  { reqCode            :: !Text
  , reqEmail           :: !Text
  , reqClientSessionId :: !Text
  } deriving (Show)

instance FromJSON SubmitReq where
  parseJSON = withObject "SubmitReq" $ \o ->
    SubmitReq
      <$> o .: "code"
      <*> o .: "email"
      <*> o .: "clientSessionId"

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
  { appConfig         :: !AppConfig
  , appTemplate       :: !TemplateParts
  , appDb             :: !Database
  , appSem            :: !QSem
  , appPendingCount   :: !(TVar Int)
  , appInflightEmails :: !(TVar (Set Text))
  }

main :: IO ()
main = do
  cfg <- loadConfig
  template <- loadTemplateParts (cfgTemplatePath cfg)
  db <- openDatabase (cfgDbPath cfg)
  runMigrations db
  sem <- newQSem (cfgWorkers cfg)
  pendingCount <- newTVarIO 0
  inflightEmails <- newTVarIO Set.empty
  let state =
        AppState
          { appConfig = cfg
          , appTemplate = template
          , appDb = db
          , appSem = sem
          , appPendingCount = pendingCount
          , appInflightEmails = inflightEmails
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
handleSubmit state@AppState {..} req respond = do
  body <- strictRequestBody req
  nowMs <- currentTimeMs
  let clientIp = requestClientIp (cfgTrustProxy appConfig) req
      userAgent = requestUserAgent req
  case eitherDecode body :: Either String SubmitReq of
    Left err -> do
      persistAbuseEvent state AbuseEvent
        { abuseEventEmail = Nothing
        , abuseEventClientIp = clientIp
        , abuseEventUserAgent = userAgent
        , abuseEventClientSessionId = Nothing
        , abuseEventHappenedAtMs = nowMs
        , abuseEventReasonCode = errorCodeText InvalidJson
        , abuseEventRetryAfterMs = Nothing
        , abuseEventSourceSha256 = Nothing
        , abuseEventDetails = object
            [ "decodeError" .= err
            , "bodyBytes" .= BL.length body
            ]
        }
      respondApiError respond ApiError
        { apiErrorCode = InvalidJson
        , apiErrorMessage = "Corpo da submissão inválido."
        , apiErrorRetryAfterMs = Nothing
        }
    Right submitReq ->
      handleParsedSubmit state respond nowMs clientIp userAgent submitReq

handleParsedSubmit
  :: AppState
  -> (Response -> IO a)
  -> Int64
  -> Text
  -> Text
  -> SubmitReq
  -> IO a
handleParsedSubmit state@AppState {..} respond nowMs clientIp userAgent SubmitReq {..} =
  case validateInstitutionalEmail (cfgAllowedEmailDomains appConfig) reqEmail of
    Left err -> do
      persistAbuseEvent state AbuseEvent
        { abuseEventEmail = Nothing
        , abuseEventClientIp = clientIp
        , abuseEventUserAgent = userAgent
        , abuseEventClientSessionId = nonEmptyText reqClientSessionId
        , abuseEventHappenedAtMs = nowMs
        , abuseEventReasonCode = errorCodeText InvalidEmail
        , abuseEventRetryAfterMs = Nothing
        , abuseEventSourceSha256 = Just (sha256Text reqCode)
        , abuseEventDetails = object ["rawEmail" .= reqEmail]
        }
      respondApiError respond ApiError
        { apiErrorCode = InvalidEmail
        , apiErrorMessage = err
        , apiErrorRetryAfterMs = Nothing
        }
    Right normalizedEmail ->
      case extractStudentBody appTemplate reqCode of
        Left err -> do
          persistAbuseEvent state AbuseEvent
            { abuseEventEmail = Just normalizedEmail
            , abuseEventClientIp = clientIp
            , abuseEventUserAgent = userAgent
            , abuseEventClientSessionId = nonEmptyText reqClientSessionId
            , abuseEventHappenedAtMs = nowMs
            , abuseEventReasonCode = errorCodeText TemplateTamper
            , abuseEventRetryAfterMs = Nothing
            , abuseEventSourceSha256 = Just (sha256Text reqCode)
            , abuseEventDetails = object []
            }
          respondApiError respond ApiError
            { apiErrorCode = TemplateTamper
            , apiErrorMessage = err
            , apiErrorRetryAfterMs = Nothing
            }
        Right studentBody -> do
          let sourceHash = sha256Text reqCode
              since15m = nowMs - 900000
              since1h = nowMs - 3600000
              since1m = nowMs - 60000
          limitSnapshot <-
            loadLimitSnapshot appDb normalizedEmail clientIp since15m since1h since1m
          case evaluateRateLimits appConfig nowMs limitSnapshot of
            Just apiErr -> do
              persistAbuseEvent state AbuseEvent
                { abuseEventEmail = Just normalizedEmail
                , abuseEventClientIp = clientIp
                , abuseEventUserAgent = userAgent
                , abuseEventClientSessionId = nonEmptyText reqClientSessionId
                , abuseEventHappenedAtMs = nowMs
                , abuseEventReasonCode = errorCodeText (apiErrorCode apiErr)
                , abuseEventRetryAfterMs = apiErrorRetryAfterMs apiErr
                , abuseEventSourceSha256 = Just sourceHash
                , abuseEventDetails = limitSnapshotDetails limitSnapshot
                }
              respondApiError respond apiErr
            Nothing -> do
              inflightClaimed <- atomically $
                claimInflightEmail appInflightEmails normalizedEmail
              if not inflightClaimed
                then do
                  let apiErr =
                        ApiError
                          { apiErrorCode = EmailInFlight
                          , apiErrorMessage = "Já existe uma submissão em andamento para este email."
                          , apiErrorRetryAfterMs = Just 1000
                          }
                  persistAbuseEvent state AbuseEvent
                    { abuseEventEmail = Just normalizedEmail
                    , abuseEventClientIp = clientIp
                    , abuseEventUserAgent = userAgent
                    , abuseEventClientSessionId = nonEmptyText reqClientSessionId
                    , abuseEventHappenedAtMs = nowMs
                    , abuseEventReasonCode = errorCodeText EmailInFlight
                    , abuseEventRetryAfterMs = apiErrorRetryAfterMs apiErr
                    , abuseEventSourceSha256 = Just sourceHash
                    , abuseEventDetails = object []
                    }
                  respondApiError respond apiErr
                else do
                  pendingClaimed <- atomically $
                    claimPendingSlot appPendingCount (cfgMaxPendingSubmissions appConfig)
                  if not pendingClaimed
                    then do
                      atomically $ releaseInflightEmail appInflightEmails normalizedEmail
                      let apiErr =
                            ApiError
                              { apiErrorCode = ServerBusy
                              , apiErrorMessage = "O servidor está ocupado no momento. Tente novamente em instantes."
                              , apiErrorRetryAfterMs = Nothing
                              }
                      persistAbuseEvent state AbuseEvent
                        { abuseEventEmail = Just normalizedEmail
                        , abuseEventClientIp = clientIp
                        , abuseEventUserAgent = userAgent
                        , abuseEventClientSessionId = nonEmptyText reqClientSessionId
                        , abuseEventHappenedAtMs = nowMs
                        , abuseEventReasonCode = errorCodeText ServerBusy
                        , abuseEventRetryAfterMs = Nothing
                        , abuseEventSourceSha256 = Just sourceHash
                        , abuseEventDetails = object
                            [ "maxPendingSubmissions" .= cfgMaxPendingSubmissions appConfig ]
                        }
                      respondApiError respond apiErr
                    else do
                      result <- (try (flip finally releaseAdmission $ do
                        submissionId <-
                          createSubmission appDb NewSubmission
                            { newSubmissionEmail = normalizedEmail
                            , newSubmissionClientIp = clientIp
                            , newSubmissionUserAgent = userAgent
                            , newSubmissionClientSessionId = reqClientSessionId
                            , newSubmissionReceivedAtMs = nowMs
                            , newSubmissionSourceCode = reqCode
                            , newSubmissionSourceSha256 = sourceHash
                            }
                        executeSubmission appDb appSem submissionId studentBody
                        ) :: IO (Either SomeException SubmitResp))
                      case result of
                        Left _ ->
                          respondApiError respond ApiError
                            { apiErrorCode = WorkerFailure
                            , apiErrorMessage = "Falha interna ao processar a submissão."
                            , apiErrorRetryAfterMs = Nothing
                            }
                        Right submitResp ->
                          respond $ responseLBS status200
                            [(hContentType, "application/json")]
                            (encode submitResp)
                      where
                        releaseAdmission = atomically $ do
                          releasePendingSlot appPendingCount
                          releaseInflightEmail appInflightEmails normalizedEmail

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

persistAbuseEvent :: AppState -> AbuseEvent -> IO ()
persistAbuseEvent AppState { appDb } = logAbuseEvent appDb

limitSnapshotDetails :: LimitSnapshot -> Value
limitSnapshotDetails LimitSnapshot {..} =
  object
    [ "emailCount15m" .= limitEmailCount15m
    , "emailCount1h" .= limitEmailCount1h
    , "ipCount1m" .= limitIpCount1m
    ]

claimInflightEmail :: TVar (Set Text) -> Text -> STM Bool
claimInflightEmail var email = do
  emails <- readTVar var
  if Set.member email emails
    then pure False
    else do
      writeTVar var (Set.insert email emails)
      pure True

releaseInflightEmail :: TVar (Set Text) -> Text -> STM ()
releaseInflightEmail var email =
  modifyTVar' var (Set.delete email)

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

nonEmptyText :: Text -> Maybe Text
nonEmptyText txt
  | T.null (T.strip txt) = Nothing
  | otherwise = Just txt

failIO :: SomeException -> IO a
failIO err = ioError (userError (show err))
