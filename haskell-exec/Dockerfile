# syntax=docker/dockerfile:1.7

# Stage 1: build the Haskell HTTP wrapper
FROM haskell:9.6.7-slim-bullseye AS builder

WORKDIR /build
RUN apt-get update \
 && apt-get install -y --no-install-recommends libsqlite3-dev \
 && rm -rf /var/lib/apt/lists/*
RUN cabal update

COPY haskell-exec/cabal.project haskell-exec/server.cabal ./
RUN cabal build --only-dependencies --enable-optimization=1

COPY haskell-exec/ ./
RUN cabal build --enable-optimization=1 \
 && mkdir -p /out \
 && cp "$(cabal list-bin server)" /out/server

# Stage 2: runtime — slim + bwrap + runghc
# The runtime image keeps the Haskell base image because we need `runghc`
# and the GHC package DB to execute student submissions.
FROM haskell:9.6.7-slim-bullseye AS runtime

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bubblewrap \
      coreutils \
      ca-certificates \
      curl \
      libsqlite3-0 \
      libnuma1 \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /out/server /usr/local/bin/server
COPY student-template.hs /opt/lexer-lab/student-template.hs

EXPOSE 8080

ENV HOME=/tmp \
    LC_ALL=C.UTF-8 \
    LANG=C.UTF-8 \
    LEXER_LAB_TEMPLATE=/opt/lexer-lab/student-template.hs \
    LEXER_LAB_WORKERS=4 \
    PORT=8080

CMD ["/usr/local/bin/server"]
