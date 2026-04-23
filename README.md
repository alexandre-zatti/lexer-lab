# Lexer Lab

A LeetCode-style training ground for a single, focused Haskell exercise: write a
**hand-rolled lexer** for a tiny arithmetic language and watch it light up
green, case by case.

Lexer Lab is a full-stack sandbox:

- a dark, split-pane web editor with locked template regions and CodeMirror's
  Haskell mode,
- a **judge** that compiles and runs each submission inside a
  [Bubblewrap](https://github.com/containers/bubblewrap) sandbox via `runghc`,
- a fixture suite that scores the submission against a reference lexer and
  streams back a per-case diff.

It was originally built as a one-evening classroom tool. The repo is published
as a reference for anyone who wants to see how a small judge-on-the-web service
goes together.

## The challenge

Implement a `lexer :: String -> [Token]` function. The token contract is
fixed:

```haskell
data Token = TokNum Int
           | TokIdent String
           | TokPlus      -- +
           | TokStar      -- *
           | TokLParen    -- (
           | TokRParen    -- )
```

Rules:

- Consecutive digits collapse into a single `TokNum n` (maximal munch).
- Identifiers start with a letter and may continue with letters, digits, or
  underscores.
- `+`, `*`, `(` and `)` become the matching token constructors.
- Whitespace is skipped.
- Any character outside the contract must cause the lexer to fail.

The editor ships a locked template wrapper; you only edit the region between
the `[STUDENT-BEGIN]` / `[STUDENT-END]` markers. The judge pastes your body
back into the wrapper, compiles it, runs each fixture against a reference
implementation, and returns which checks passed.

## Stack

| Layer       | Tech                                                        |
| ----------- | ----------------------------------------------------------- |
| Frontend    | React 19 · Vite 7 · CodeMirror 6 · Zustand · TypeScript 5   |
| Backend     | Haskell 9.6 · Warp · wai · aeson · sqlite-simple            |
| Sandbox     | Bubblewrap (`bwrap`) + `runghc`, 5 s wall-clock per run     |
| Persistence | SQLite (submission log + per-IP rate-limit window)          |
| Deploy      | Two Docker images behind an nginx reverse proxy             |

## Run it locally

### Frontend only (hot reload)

```bash
npm install
npm run dev
```

Point `VITE_HASKELL_API` at a running judge (defaults to `http://localhost:8080`).

```bash
# optional override
echo 'VITE_HASKELL_API=http://localhost:8080' > .env.local
```

### Full stack via Docker Compose

```bash
docker compose up -d --build
```

- Frontend: <http://localhost:4173>
- Judge API: <http://localhost:8080>

Health checks:

```bash
curl http://127.0.0.1:8080/healthz
curl http://127.0.0.1:4173/healthz   # nginx proxies /healthz to the judge
```

### Tests

```bash
npm test          # frontend unit tests (Vitest)
npm run build     # typecheck + production build
```

## How the judge works

1. The frontend posts `{ code }` to `POST /submit`. The payload is the full
   template — prefix, your body, suffix — so the server can verify the wrapper
   has not been tampered with.
2. The server carves out your body, sticks it into a larger program that
   includes a reference lexer plus a JSON-emitting harness, and writes the
   result to a temp dir.
3. The temp dir is mounted into a `bwrap` sandbox with the network, IPC, and
   UTS namespaces unshared and `/` mounted read-only. The child process runs
   `runghc Main.hs` under a 5-second `timeout`.
4. The harness prints sentinel-wrapped JSON describing each fixture's expected
   and observed output. The server decodes that, stores a row in SQLite, and
   returns the judge verdict to the browser.

On Linux hosts where unprivileged user namespaces are disabled (some cloud VPS
images), the sandbox retries with `--cap-drop ALL` instead of `--unshare-user`.

## Rate limiting

The judge tracks recent submissions per client IP inside SQLite. With the
default `LEXER_LAB_IP_ATTEMPT_LIMIT_1M=120`, the server rejects a 121st
submission in a 60-second window with a `429` and a `Retry-After` header. The
UI also enforces a 10-second client-side courtesy cooldown between submits.

## Configuration

All configuration is read from environment variables:

| Variable                             | Default                    | Purpose                                              |
| ------------------------------------ | -------------------------- | ---------------------------------------------------- |
| `PORT`                               | `8080`                     | Judge HTTP port                                      |
| `LEXER_LAB_WORKERS`                  | `4`                        | Concurrent `runghc` workers                          |
| `LEXER_LAB_TEMPLATE`                 | `student-template.hs`      | Path to the locked template                          |
| `LEXER_LAB_DB_PATH`                  | `/data/lexer-lab.sqlite3`  | SQLite file                                          |
| `LEXER_LAB_IP_ATTEMPT_LIMIT_1M`      | `120`                      | Max submissions per IP per minute                    |
| `LEXER_LAB_MAX_PENDING_SUBMISSIONS`  | `16`                       | Max in-flight submissions before returning `429`     |
| `LEXER_LAB_TRUST_PROXY`              | `0`                        | Honour `X-Forwarded-For` (set to `1` behind a proxy) |

## Repo layout

```text
src/              React + Vite frontend
  lexer-lab/      Shared types, fixtures, API client
  components/     Editor, judge panel, error panel
  state/          Zustand store (persisted to localStorage)
haskell-exec/     Judge service — Warp server, SQLite, bwrap runner
student-template.hs  Locked template injected into each submission
nginx/            Reverse proxy config for the web container
```

## License

BSD-3-Clause. See the `server.cabal` license field; the rest of the repo is
published under the same terms.
