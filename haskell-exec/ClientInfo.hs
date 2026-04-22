{-# LANGUAGE OverloadedStrings #-}

module ClientInfo
  ( forwardedIpFromHeader
  , requestClientIp
  , requestUserAgent
  , resolveClientIp
  , socketIpText
  ) where

import           Data.ByteString          (ByteString)
import           Data.Text                (Text)
import qualified Data.Text                as T
import qualified Data.Text.Encoding       as TE
import           Data.Text.Encoding.Error (lenientDecode)
import           Network.Socket           (HostAddress, HostAddress6,
                                           SockAddr (..),
                                           hostAddress6ToTuple,
                                           hostAddressToTuple)
import           Numeric                  (showHex)
import           Network.Wai              (Request, remoteHost, requestHeaders)

requestClientIp :: Bool -> Request -> Text
requestClientIp trustProxy req =
  resolveClientIp trustProxy forwarded remote
  where
    forwarded = lookup "X-Forwarded-For" (requestHeaders req)
    remote = socketIpText (remoteHost req)

requestUserAgent :: Request -> Text
requestUserAgent req =
  maybe "" (TE.decodeUtf8With lenientDecode) (lookup "User-Agent" (requestHeaders req))

resolveClientIp :: Bool -> Maybe ByteString -> Text -> Text
resolveClientIp trustProxy forwardedHeader remoteIp
  | trustProxy =
      maybe remoteIp id (forwardedHeader >>= forwardedIpFromHeader)
  | otherwise = remoteIp

forwardedIpFromHeader :: ByteString -> Maybe Text
forwardedIpFromHeader =
  nonEmptyText
    . T.strip
    . headOrEmpty
    . T.splitOn ","
    . TE.decodeUtf8With lenientDecode

socketIpText :: SockAddr -> Text
socketIpText sockAddr = case sockAddr of
  SockAddrInet _ host      -> hostAddressText host
  SockAddrInet6 _ _ host _ -> hostAddress6Text host
  SockAddrUnix path        -> T.pack path

hostAddressText :: HostAddress -> Text
hostAddressText host =
  T.intercalate "." (map (T.pack . show) [a, b, c, d])
  where
    (a, b, c, d) = hostAddressToTuple host

hostAddress6Text :: HostAddress6 -> Text
hostAddress6Text host =
  T.intercalate ":" (map (T.pack . (`showHex` "")) [a, b, c, d, e, f, g, h])
  where
    (a, b, c, d, e, f, g, h) = hostAddress6ToTuple host

headOrEmpty :: [Text] -> Text
headOrEmpty []    = ""
headOrEmpty (x:_) = x

nonEmptyText :: Text -> Maybe Text
nonEmptyText txt
  | T.null txt = Nothing
  | otherwise = Just txt
