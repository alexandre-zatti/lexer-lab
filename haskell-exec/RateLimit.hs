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
        , apiErrorMessage = "Muitas submissões vindas desta rede. Aguarde um pouco antes de tentar novamente."
        , apiErrorRetryAfterMs = Just (windowRetry nowMs 60000 limitIpOldest1m)
        }
  | Just lastAt <- limitLastEmailSubmissionAt
  , nowMs - lastAt < cfgEmailCooldownMs =
      Just ApiError
        { apiErrorCode = EmailCooldown
        , apiErrorMessage = "Aguarde alguns segundos antes de enviar outra submissão."
        , apiErrorRetryAfterMs = Just (cfgEmailCooldownMs - (nowMs - lastAt))
        }
  | limitEmailCount15m >= cfgEmailLimit15m =
      Just ApiError
        { apiErrorCode = EmailLimit15m
        , apiErrorMessage = "Você atingiu o limite de submissões dos últimos 15 minutos."
        , apiErrorRetryAfterMs = Just (windowRetry nowMs 900000 limitEmailOldest15m)
        }
  | limitEmailCount1h >= cfgEmailLimit1h =
      Just ApiError
        { apiErrorCode = EmailLimit1h
        , apiErrorMessage = "Você atingiu o limite de submissões da última hora."
        , apiErrorRetryAfterMs = Just (windowRetry nowMs 3600000 limitEmailOldest1h)
        }
  | otherwise =
      Nothing

windowRetry :: Int64 -> Int64 -> Maybe Int64 -> Int64
windowRetry nowMs windowMs oldestMs =
  case oldestMs of
    Nothing -> windowMs
    Just ts -> max 1000 (windowMs - max 0 (nowMs - ts))
