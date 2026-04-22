# Lexer Lab

Lexer Lab is a small judge-first training app for UFFS lexical analysis exercises.
Students implement a Haskell `lexer :: String -> [Token]` function in the browser, submit it, and receive fixture-by-fixture feedback from a sandboxed Haskell runner.

## What It Includes

- React + Vite frontend with a focused editor workflow
- Haskell HTTP service that validates submissions and runs the judge
- SQLite persistence for submissions, rate limits, and abuse events
- Docker Compose stack with both services:
  - `web` on `http://localhost:4173`
  - `haskell-exec` on `http://localhost:8080`

## Local Development

### Frontend dev mode

```bash
npm install
npm run dev
```

The frontend expects the backend at `http://localhost:8080` by default.
For local overrides, use `.env.development`:

```env
VITE_HASKELL_API=http://localhost:8080
```

### Test and build

```bash
npm test
npm run build
```

### Full stack with Docker Compose

```bash
docker compose up -d --build
```

Services:

- `web`: `http://localhost:4173`
- `haskell-exec`: `http://localhost:8080`

Smoke checks:

```bash
curl http://127.0.0.1:8080/healthz
curl http://127.0.0.1:4173/healthz
```

## Stack Overview

### Frontend

- React 19
- Vite 7
- CodeMirror 6
- Zustand

### Backend

- Haskell 9.6
- Warp / Wai
- bubblewrap sandbox execution
- SQLite via `sqlite-simple`

## Deployment Notes

The compose stack is set up for container platforms such as Coolify:

- `web` builds the static frontend and serves it with Nginx
- `web` proxies `/submit` and `/healthz` to `haskell-exec`
- `haskell-exec` stores state in the named volume `lexer-lab-data`
- `haskell-exec` runs with `SYS_ADMIN`, `NET_ADMIN`, `seccomp=unconfined`, and `apparmor=unconfined`
- the runner prefers a user-namespace `bubblewrap` sandbox, but falls back to a capability-dropped nested sandbox on Ubuntu 24.04+/Coolify hosts that strip capabilities inside user namespaces

For production, point your public domain at the `web` service.

## Repo Structure

```text
src/              React frontend
haskell-exec/     Haskell judge runner and API
nginx/            Reverse proxy config for the web container
docker-compose.yml
Dockerfile.web
```
