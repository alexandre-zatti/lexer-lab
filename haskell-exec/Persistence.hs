{-# LANGUAGE NamedFieldPuns    #-}
{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE RecordWildCards   #-}

module Persistence
  ( CompletedSubmission (..)
  , Database
  , LimitSnapshot (..)
  , NewSubmission (..)
  , closeDatabase
  , completeSubmission
  , createSubmission
  , loadLimitSnapshot
  , openDatabase
  , runMigrations
  ) where

import           Data.Int                      (Int64)
import           Data.Text                     (Text)
import           Database.SQLite.Simple        (Connection, Query, close,
                                                execute, execute_,
                                                lastInsertRowId, open, query)
import           Database.SQLite.Simple.ToRow  (ToRow)
import           System.Directory              (createDirectoryIfMissing)
import           System.FilePath               (takeDirectory)

type Database = Connection

data NewSubmission = NewSubmission
  { newSubmissionClientIp      :: !Text
  , newSubmissionUserAgent     :: !Text
  , newSubmissionReceivedAtMs  :: !Int64
  , newSubmissionSourceCode    :: !Text
  , newSubmissionSourceSha256  :: !Text
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

data LimitSnapshot = LimitSnapshot
  { limitIpCount1m  :: !Int
  , limitIpOldest1m :: !(Maybe Int64)
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
    "CREATE TABLE IF NOT EXISTS submissions (\
    \ id INTEGER PRIMARY KEY AUTOINCREMENT,\
    \ client_ip TEXT NOT NULL,\
    \ user_agent TEXT NOT NULL,\
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
    "CREATE INDEX IF NOT EXISTS idx_submissions_ip_received_at\
    \ ON submissions(client_ip, received_at)"

createSubmission :: Database -> NewSubmission -> IO Int64
createSubmission conn NewSubmission {..} = do
  execute
    conn
    "INSERT INTO submissions (\
    \ client_ip, user_agent, received_at, source_code, source_sha256\
    \ ) VALUES (?, ?, ?, ?, ?)"
    ( newSubmissionClientIp
    , newSubmissionUserAgent
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

loadLimitSnapshot :: Database -> Text -> Int64 -> IO LimitSnapshot
loadLimitSnapshot conn clientIp since1m = do
  (ipCount1m, ipOldest1m) <- queryCountAndOldest
    conn
    "SELECT COUNT(*), MIN(received_at) FROM submissions\
    \ WHERE client_ip = ? AND received_at >= ?"
    (clientIp, since1m)
  pure LimitSnapshot
    { limitIpCount1m = ipCount1m
    , limitIpOldest1m = ipOldest1m
    }

queryCountAndOldest :: ToRow a => Database -> Query -> a -> IO (Int, Maybe Int64)
queryCountAndOldest conn sql params = do
  rows <- query conn sql params :: IO [(Int64, Maybe Int64)]
  pure $ case rows of
    [(countValue, oldestValue)] -> (fromIntegral countValue, oldestValue)
    _                           -> (0, Nothing)

boolToInt :: Bool -> Int
boolToInt True  = 1
boolToInt False = 0
