{-# LANGUAGE NamedFieldPuns    #-}
{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE RecordWildCards   #-}

module RateLimit
  ( evaluateRateLimits
  ) where

import           Config      (AppConfig (..))
import           Data.Int    (Int64)
import           HttpError   (ApiError (..), ErrorCode (..))
import           Persistence (LimitSnapshot (..))

evaluateRateLimits :: AppConfig -> Int64 -> LimitSnapshot -> Maybe ApiError
evaluateRateLimits AppConfig {..} nowMs LimitSnapshot {..}
  | limitIpCount1m >= cfgIpAttemptLimit1m =
      Just ApiError
        { apiErrorCode = IpLimit
        , apiErrorMessage = "Too many submissions from this network. Try again in a moment."
        , apiErrorRetryAfterMs = Just (windowRetry nowMs 60000 limitIpOldest1m)
        }
  | otherwise =
      Nothing

windowRetry :: Int64 -> Int64 -> Maybe Int64 -> Int64
windowRetry nowMs windowMs oldestMs =
  case oldestMs of
    Nothing -> windowMs
    Just ts -> max 1000 (windowMs - max 0 (nowMs - ts))
