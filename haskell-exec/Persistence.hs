{-# LANGUAGE NamedFieldPuns    #-}
{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE RecordWildCards   #-}

module Persistence
  ( AbuseEvent (..)
  , CompletedSubmission (..)
  , Database
  , LimitSnapshot (..)
  , NewSubmission (..)
  , closeDatabase
  , completeSubmission
  , createSubmission
  , loadLimitSnapshot
  , logAbuseEvent
  , openDatabase
  , runMigrations
  ) where

import           Data.Aeson                    (Value, encode)
import qualified Data.ByteString.Lazy          as BL
import           Data.Int                      (Int64)
import           Data.Text                     (Text)
import qualified Data.Text.Encoding            as TE
import           Database.SQLite.Simple        (Connection, Only (..), Query,
                                                close, execute, execute_,
                                                lastInsertRowId, open, query,
                                                withTransaction)
import           Database.SQLite.Simple.ToRow  (ToRow)
import           System.Directory              (createDirectoryIfMissing)
import           System.FilePath               (takeDirectory)

type Database = Connection

data NewSubmission = NewSubmission
  { newSubmissionEmail           :: !Text
  , newSubmissionClientIp        :: !Text
  , newSubmissionUserAgent       :: !Text
  , newSubmissionClientSessionId :: !Text
  , newSubmissionReceivedAtMs    :: !Int64
  , newSubmissionSourceCode      :: !Text
  , newSubmissionSourceSha256    :: !Text
  } deriving (Show)

data CompletedSubmission = CompletedSubmission
  { completedSubmissionCompletedAtMs    :: !Int64
  , completedSubmissionRunnerExitCode   :: !(Maybe Int)
  , completedSubmissionRunnerStdout     :: !Text
  , completedSubmissionRunnerStderr     :: !Text
  , completedSubmissionExecutionTimeMs  :: !(Maybe Double)
  , completedSubmissionJudgeResultsJson :: !(Maybe Text)
  , completedSubmissionPassedCount      :: !(Maybe Int)
  , completedSubmissionTotalCount       :: !(Maybe Int)
  , completedSubmissionAllPassed        :: !(Maybe Bool)
  } deriving (Show)

data AbuseEvent = AbuseEvent
  { abuseEventEmail           :: !(Maybe Text)
  , abuseEventClientIp        :: !Text
  , abuseEventUserAgent       :: !Text
  , abuseEventClientSessionId :: !(Maybe Text)
  , abuseEventHappenedAtMs    :: !Int64
  , abuseEventReasonCode      :: !Text
  , abuseEventRetryAfterMs    :: !(Maybe Int64)
  , abuseEventSourceSha256    :: !(Maybe Text)
  , abuseEventDetails         :: !Value
  } deriving (Show)

data LimitSnapshot = LimitSnapshot
  { limitLastEmailSubmissionAt :: !(Maybe Int64)
  , limitEmailCount15m         :: !Int
  , limitEmailOldest15m        :: !(Maybe Int64)
  , limitEmailCount1h          :: !Int
  , limitEmailOldest1h         :: !(Maybe Int64)
  , limitIpCount1m             :: !Int
  , limitIpOldest1m            :: !(Maybe Int64)
  } deriving (Eq, Show)

openDatabase :: FilePath -> IO Database
openDatabase path = do
  createDirectoryIfMissing True (takeDirectory path)
  conn <- open path
  execute_ conn "PRAGMA journal_mode=WAL"
  execute_ conn "PRAGMA foreign_keys=ON"
  execute_ conn "PRAGMA busy_timeout=5000"
  pure conn

closeDatabase :: Database -> IO ()
closeDatabase = close

runMigrations :: Database -> IO ()
runMigrations conn = do
  execute_
    conn
    "CREATE TABLE IF NOT EXISTS users (\
    \ email TEXT PRIMARY KEY,\
    \ created_at INTEGER NOT NULL,\
    \ updated_at INTEGER NOT NULL,\
    \ first_submission_at INTEGER NOT NULL,\
    \ last_submission_at INTEGER NOT NULL,\
    \ submission_count INTEGER NOT NULL\
    \)"
  execute_
    conn
    "CREATE TABLE IF NOT EXISTS submissions (\
    \ id INTEGER PRIMARY KEY AUTOINCREMENT,\
    \ email TEXT NOT NULL REFERENCES users(email),\
    \ client_ip TEXT NOT NULL,\
    \ user_agent TEXT NOT NULL,\
    \ client_session_id TEXT NOT NULL,\
    \ received_at INTEGER NOT NULL,\
    \ completed_at INTEGER,\
    \ source_code TEXT NOT NULL,\
    \ source_sha256 TEXT NOT NULL,\
    \ runner_exit_code INTEGER,\
    \ runner_stdout TEXT,\
    \ runner_stderr TEXT,\
    \ execution_time_ms REAL,\
    \ judge_results_json TEXT,\
    \ passed_count INTEGER,\
    \ total_count INTEGER,\
    \ all_passed INTEGER\
    \)"
  execute_
    conn
    "CREATE TABLE IF NOT EXISTS abuse_events (\
    \ id INTEGER PRIMARY KEY AUTOINCREMENT,\
    \ email TEXT,\
    \ client_ip TEXT NOT NULL,\
    \ user_agent TEXT NOT NULL,\
    \ client_session_id TEXT,\
    \ happened_at INTEGER NOT NULL,\
    \ reason_code TEXT NOT NULL,\
    \ retry_after_ms INTEGER,\
    \ source_sha256 TEXT,\
    \ details_json TEXT NOT NULL\
    \)"
  execute_
    conn
    "CREATE INDEX IF NOT EXISTS idx_submissions_email_received_at\
    \ ON submissions(email, received_at)"
  execute_
    conn
    "CREATE INDEX IF NOT EXISTS idx_submissions_ip_received_at\
    \ ON submissions(client_ip, received_at)"
  execute_
    conn
    "CREATE INDEX IF NOT EXISTS idx_abuse_events_ip_happened_at\
    \ ON abuse_events(client_ip, happened_at)"

createSubmission :: Database -> NewSubmission -> IO Int64
createSubmission conn NewSubmission {..} =
  withTransaction conn $ do
    upsertUser conn newSubmissionEmail newSubmissionReceivedAtMs
    execute
      conn
      "INSERT INTO submissions (\
      \ email, client_ip, user_agent, client_session_id, received_at,\
      \ source_code, source_sha256\
      \ ) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ( newSubmissionEmail
      , newSubmissionClientIp
      , newSubmissionUserAgent
      , newSubmissionClientSessionId
      , newSubmissionReceivedAtMs
      , newSubmissionSourceCode
      , newSubmissionSourceSha256
      )
    lastInsertRowId conn

completeSubmission :: Database -> Int64 -> CompletedSubmission -> IO ()
completeSubmission conn submissionId CompletedSubmission {..} =
  execute
    conn
    "UPDATE submissions\
    \ SET completed_at = ?,\
    \     runner_exit_code = ?,\
    \     runner_stdout = ?,\
    \     runner_stderr = ?,\
    \     execution_time_ms = ?,\
    \     judge_results_json = ?,\
    \     passed_count = ?,\
    \     total_count = ?,\
    \     all_passed = ?\
    \ WHERE id = ?"
    ( completedSubmissionCompletedAtMs
    , completedSubmissionRunnerExitCode
    , completedSubmissionRunnerStdout
    , completedSubmissionRunnerStderr
    , completedSubmissionExecutionTimeMs
    , completedSubmissionJudgeResultsJson
    , completedSubmissionPassedCount
    , completedSubmissionTotalCount
    , fmap boolToInt completedSubmissionAllPassed
    , submissionId
    )

logAbuseEvent :: Database -> AbuseEvent -> IO ()
logAbuseEvent conn AbuseEvent {..} =
  execute
    conn
    "INSERT INTO abuse_events (\
    \ email, client_ip, user_agent, client_session_id, happened_at,\
    \ reason_code, retry_after_ms, source_sha256, details_json\
    \ ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ( abuseEventEmail
    , abuseEventClientIp
    , abuseEventUserAgent
    , abuseEventClientSessionId
    , abuseEventHappenedAtMs
    , abuseEventReasonCode
    , abuseEventRetryAfterMs
    , abuseEventSourceSha256
    , encodeValueText abuseEventDetails
    )

loadLimitSnapshot :: Database -> Text -> Text -> Int64 -> Int64 -> Int64 -> IO LimitSnapshot
loadLimitSnapshot conn email clientIp since15m since1h since1m = do
  lastEmailSubmissionAt <- queryMaybeInt64
    conn
    "SELECT MAX(received_at) FROM submissions WHERE email = ?"
    (Only email)
  (count15m, oldest15m) <- queryCountAndOldest
    conn
    "SELECT COUNT(*), MIN(received_at)\
    \ FROM submissions WHERE email = ? AND received_at >= ?"
    (email, since15m)
  (count1h, oldest1h) <- queryCountAndOldest
    conn
    "SELECT COUNT(*), MIN(received_at)\
    \ FROM submissions WHERE email = ? AND received_at >= ?"
    (email, since1h)
  (ipCount1m, ipOldest1m) <- queryCountAndOldest
    conn
    "SELECT COUNT(*), MIN(ts) FROM (\
    \ SELECT received_at AS ts FROM submissions\
    \ WHERE client_ip = ? AND received_at >= ?\
    \ UNION ALL\
    \ SELECT happened_at AS ts FROM abuse_events\
    \ WHERE client_ip = ? AND happened_at >= ?\
    \ )"
    (clientIp, since1m, clientIp, since1m)
  pure LimitSnapshot
    { limitLastEmailSubmissionAt = lastEmailSubmissionAt
    , limitEmailCount15m = count15m
    , limitEmailOldest15m = oldest15m
    , limitEmailCount1h = count1h
    , limitEmailOldest1h = oldest1h
    , limitIpCount1m = ipCount1m
    , limitIpOldest1m = ipOldest1m
    }

upsertUser :: Database -> Text -> Int64 -> IO ()
upsertUser conn email nowMs =
  execute
    conn
    "INSERT INTO users (\
    \ email, created_at, updated_at, first_submission_at,\
    \ last_submission_at, submission_count\
    \ ) VALUES (?, ?, ?, ?, ?, 1)\
    \ ON CONFLICT(email) DO UPDATE SET\
    \   updated_at = excluded.updated_at,\
    \   last_submission_at = excluded.last_submission_at,\
    \   submission_count = users.submission_count + 1"
    (email, nowMs, nowMs, nowMs, nowMs)

queryMaybeInt64 :: Database -> Query -> Only Text -> IO (Maybe Int64)
queryMaybeInt64 conn sql params = do
  rows <- query conn sql params :: IO [Only (Maybe Int64)]
  pure $ case rows of
    [Only value] -> value
    _            -> Nothing

queryCountAndOldest :: ToRow a => Database -> Query -> a -> IO (Int, Maybe Int64)
queryCountAndOldest conn sql params = do
  rows <- query conn sql params :: IO [(Int64, Maybe Int64)]
  pure $ case rows of
    [(countValue, oldestValue)] -> (fromIntegral countValue, oldestValue)
    _                           -> (0, Nothing)

boolToInt :: Bool -> Int
boolToInt True  = 1
boolToInt False = 0

encodeValueText :: Value -> Text
encodeValueText = TE.decodeUtf8 . BL.toStrict . encode
