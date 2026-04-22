{-# LANGUAGE NamedFieldPuns    #-}
{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE RecordWildCards   #-}

module HttpError
  ( ApiError (..)
  , ErrorCode (..)
  , apiErrorHeaders
  , apiErrorStatus
  , errorCodeText
  ) where

import           Data.Aeson            (ToJSON (..), object, (.=))
import           Data.ByteString.Char8 (pack)
import           Data.Int              (Int64)
import           Data.Text             (Text)
import           Network.HTTP.Types    (Header, Status, status400, status429,
                                        status503)

data ErrorCode
  = InvalidJson
  | InvalidEmail
  | TemplateTamper
  | IpLimit
  | EmailCooldown
  | EmailLimit15m
  | EmailLimit1h
  | EmailInFlight
  | ServerBusy
  | WorkerFailure
  deriving (Eq, Show)

data ApiError = ApiError
  { apiErrorCode         :: !ErrorCode
  , apiErrorMessage      :: !Text
  , apiErrorRetryAfterMs :: !(Maybe Int64)
  } deriving (Eq, Show)

instance ToJSON ApiError where
  toJSON ApiError {..} =
    object
      [ "code" .= errorCodeText apiErrorCode
      , "message" .= apiErrorMessage
      , "retryAfterMs" .= apiErrorRetryAfterMs
      ]

apiErrorStatus :: ApiError -> Status
apiErrorStatus ApiError { apiErrorCode = code } = case code of
  InvalidJson    -> status400
  InvalidEmail   -> status400
  TemplateTamper -> status400
  WorkerFailure  -> status503
  ServerBusy     -> status503
  IpLimit        -> status429
  EmailCooldown  -> status429
  EmailLimit15m  -> status429
  EmailLimit1h   -> status429
  EmailInFlight  -> status429

apiErrorHeaders :: ApiError -> [Header]
apiErrorHeaders ApiError { apiErrorRetryAfterMs = Nothing } = []
apiErrorHeaders ApiError { apiErrorRetryAfterMs = Just retryAfterMs } =
  [("Retry-After", pack (show retrySeconds))]
  where
    retrySeconds = max 1 ((retryAfterMs + 999) `div` 1000)

errorCodeText :: ErrorCode -> Text
errorCodeText code = case code of
  InvalidJson    -> "invalid_json"
  InvalidEmail   -> "invalid_email"
  TemplateTamper -> "template_tamper"
  IpLimit        -> "ip_limit"
  EmailCooldown  -> "email_cooldown"
  EmailLimit15m  -> "email_limit_15m"
  EmailLimit1h   -> "email_limit_1h"
  EmailInFlight  -> "email_in_flight"
  ServerBusy     -> "server_busy"
  WorkerFailure  -> "worker_failure"
