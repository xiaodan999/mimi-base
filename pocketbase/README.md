# PocketBase

The database server for mimi-base — a self-contained deployment where
everything lives inside the repo clone:

```
<mimi>/                          # wherever you clone it = the whole deployment
├── .env.prod                    # gitignored: SUPERUSER_*, DEPLOY_TOKEN,
│                                #   PB_HTTP, OPENCODE_API_KEY (chmod 600)
├── mimi-db.log                  # gitignored runtime log
├── scripts/server-setup.sh      # one-command server setup (idempotent)
└── pocketbase/                  # this dir:
    ├── server.ts                # supervisor: spawns the pinned PB binary and
    │                            #   serves the AI relay + token-protected
    │                            #   deploy endpoints on :9001
    ├── ai-relay.ts              # streaming /ai relay using the site key
    ├── pb_migrations/           # committed schema (legacy_id carryover, counters)
    ├── pb_hooks/                # JSVM hooks (post like/comment counters)
    ├── pb_data/                 # live data (gitignored — SQLite + uploaded files)
    └── pb_data_snapshots/       # pb_data snapshots taken before each deploy
```

## Local dev

```
bun run dev:all            # both of the below, PB first (reuses a running PB)
bun run db                 # serves on 127.0.0.1:8090, automigrate ON
bun run dev                # frontend on :3000 (VITE_POCKETBASE_URL in .env)
```

When the binary is missing, `server.ts` copies the pinned one from another
registered worktree, a sibling checkout, or
`~/.cache/mimi-base/pocketbase-<version>` (in that order) and only downloads
from GitHub when none of them has the matching version. New worktrees
therefore start without network access.

The binary is platform-specific: `pocketbase` on Linux/macOS and
`pocketbase.exe` on Windows; the cache name and release asset follow the
current platform. On Windows the zip is extracted with the bundled `tar`.

Set `PB_PORT` to run the database on another port (e.g. `PB_PORT=8091`), and
`VITE_PORT` for the frontend. Each worktree has its own `pb_data/`, so two
checkouts can run side by side; `dev:all` points the frontend at the PB it
started. It also picks a free `SUPERVISOR_PORT` (near 9001) for the AI relay
and points Vite's `/ai` proxy at it. In the split flow, keep
`VITE_POCKETBASE_URL` in `.env` in sync.

For AI, put `OPENCODE_API_KEY` in `.env` (never commit it). The relay is part
of `server.ts`, so it starts with `bun run db`; without a key the health route
still works and chat answers 503.

Admin UI: http://127.0.0.1:8090/_/

## Server setup (any unprivileged user, no root needed)

```bash
git clone https://github.com/xiaodan999/mimi-base && cd mimi-base
export SUPERUSER_EMAIL="you@example.com"    # admin login for the /_/ dashboard
bash scripts/server-setup.sh
curl -s localhost:8090/api/health           # -> {"message":"API is healthy."}
```

Run from the clone (or standalone — the script then clones into the
current directory). The script installs bun if missing, generates
`.env.prod`, downloads the pinned PocketBase binary (v0.40.6), applies
the committed schema and creates the superuser. It installs no cron
entries or services — PB does not auto-start at boot.

It is idempotent: safe to re-run. A re-run refreshes the clone and
re-upserts the superuser, but never rotates secrets (delete `.env.prod`
first for that — then also update the GitHub `DEPLOY_TOKEN` secret and
restart PB).

Exposing the API to the internet (reverse proxy + TLS) is a separate
concern; the requirements are that `/api/*`, `/ai/*`, `/db/sync` (and
`/spa/*` when self-hosting the frontend) are reachable by your apps and the
deploy pipeline.

## AI relay

The browser never holds an API key. It calls
`POST /ai/opencode/v1/chat/completions` with its PocketBase user token, and
the Bun supervisor forwards the request to OpenCode Go with the server key,
piping the SSE response back as it arrives. `GET /ai/health` reports
`{ ok, keyConfigured, model }`.

The general chat (`/chat`) uses two more routes:

- `GET /ai/models` (authenticated) returns the server-owned allowlist:
  `models` (each with `id`, `label`, `vision`, `tools`, `reasoning`), plus
  `defaultModel` and `keyConfigured`. The client can only render and send
  these ids.
- `POST /ai/chat/completions` behaves like the legacy endpoint but honours
  `body.model` when it is in the allowlist, rejects unknown ids with `400`,
  strips `tools` for text-only models, and rejects image parts sent to a
  model without `vision`. Legacy features keep using
  `/ai/opencode/v1/chat/completions`, where the relay still forces one model.

- `POST /ai/tools/{expenses,posts,memory,url}` (authenticated) backs the
  chat's data tools (`pocketbase/ai-tools.ts`). They have their own
  30/min + 200/day per-user limits. The ledger and feed are read
  **shared-scope** on purpose (same as the app's screens); `chat_memories`
  is owner-only with PB rules as the backstop. `read_url` resolves DNS,
  refuses private/reserved addresses and redirects into them, and strips
  HTML to text (300KB fetch cap, 12k-char output).

- **Key**: `OPENCODE_API_KEY` in `.env.prod` (prod) or `.env` (dev). It is
  never sent to PocketBase, returned to the client, or logged.
- **Model**: `OPENCODE_MODEL` (default `deepseek-v4.1-flash`). The legacy
  relay path overwrites whatever model the client sends. Chat exposes
  `deepseek-v4.1-flash`, `glm-5.3-flash` and `mimo-v2.6-flash` by default;
  `OPENCODE_CHAT_MODELS` (comma separated ids) narrows that list and
  `OPENCODE_CHAT_MODEL_DEFAULT` picks the default. The catalog, its vision /
  tools flags and the thinking levels live in `chat-models.ts`. DeepSeek and
  GLM accept `reasoning_effort` (`low` / `high` / `max`); MiMo does not, and
  the relay rejects any effort the chosen model does not list.
- **Quota**: `AI_DAILY_REQUESTS_PER_USER` (default 100, `0` = unlimited),
  plus 20 requests/minute/user. Both are in-memory and reset on restart.
- **Port**: `SUPERVISOR_PORT` overrides :9001 (dev:all chooses a free one;
  leave it unset in prod).
- **Proxy**: route `/ai/*` to the supervisor and disable response buffering,
  or the stream arrives as one chunk:

    ```nginx
    location /ai/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }
    ```

    Caddy equivalent: `reverse_proxy 127.0.0.1:9001 { flush_interval -1 }`.

The Vercel build calls the relay at `${VITE_POCKETBASE_URL}/ai/...`, so the
PB host's reverse proxy must expose `/ai/*` as well.

## Code sandbox

The chat's `sandbox_*` tools run code on the server, never in the browser.
`sandbox_run` takes a `language` (`python` or `javascript`). Production uses
two Docker images:

- `mimi-sandbox-py` is built from `pocketbase/sandbox/Dockerfile` +
  `runner.py` (`python:3.12-slim`). `mimi-sandbox-js` is built from
  `Dockerfile.node` + `runner.mjs` (`node:22-alpine`). Each tag is a content
  hash of the runner, Dockerfile and base image, so a change rebuilds it on
  the next startup. `SANDBOX_BASE_IMAGE` / `SANDBOX_BASE_IMAGE_NODE`
  override the bases (use reachable mirrors where Docker Hub is blocked).
- `pocketbase/sandbox/docker-network.sh` creates the dedicated `mimi-sandbox`
  bridge. Its egress firewall allows only public DNS and HTTP(S); loopback,
  RFC1918/CGNAT/link-local ranges, the host's own addresses and non-web
  ports are dropped in `DOCKER-USER`/`FORWARD`, and container-to-host traffic
  is dropped in `INPUT`.
- Each run is a fresh container from the image for the requested language:
  read-only root, tmpfs `/tmp`, user 65534, `cap-drop ALL`,
  `no-new-privileges`, 256 MB / 0.5 CPU / 64 PIDs, and a 20 s wall clock.
  The request arrives as JSON on stdin, so user code never appears in a
  command line and no host path is mounted.
- `POST /ai/sandbox` is the only entry point (PocketBase token auth). It
  allows one concurrent run per user and 200 runs/day. The tools are defined
  in `app/chat/tools.ts`; the protocol lives in `lib/sandbox-protocol.ts`.

Development has no Docker inside WSL, so the supervisor falls back to plain
`python3` / `node` subprocesses with a temporary directory. That fallback is
for tests only and is **not** a security boundary; production never uses it.

## Deploys

Push to `master` touching `pocketbase/**` → GitHub Actions calls the
token-protected `/db/sync` endpoint (`DEPLOY_TOKEN` secret in the
"Production" environment) → the server does `git pull --ff-only`, stops
PB, snapshots `pb_data` while it is down, starts PB and returns 200 only
after `/api/health` passes. The snapshot has to happen with PB stopped:
tarring a live SQLite database intermittently fails with `file changed as
we read it` and stores an inconsistent copy. Archives are written as
`.partial` and renamed on success, so `SNAPSHOT_KEEP` never counts a
half-written file; if a snapshot still fails, PB is restarted anyway and
the deploy answers 500. The trigger step retries 8 times over ~8 minutes
to ride out transient route failures; a red run means the deploy did NOT
happen (re-run the job from the Actions tab).

Schema changes ride the same path: committed migrations are applied when
PB restarts, even with `automigrate` off. The frontend finds the server
via `VITE_POCKETBASE_URL` (Vercel env var).

## Frontend (self-hosted, next to Vercel)

Both frontends run at the same time against the same PocketBase: Vercel
keeps building its copy with an absolute `VITE_POCKETBASE_URL`, while
`.github/workflows/deploy-spa.yml` builds a `same-origin` copy that
PocketBase serves itself from `<repo>/build` (`--publicDir`, prod only).
Nothing has to be switched off.

- **Trigger**: push to `master` touching frontend paths, or Actions →
  `deploy-spa` → Run workflow (first publish, or a manual republish).
- **Build**: `VITE_POCKETBASE_URL=same-origin bun run build` in CI (the
  typecheck inside `build` gates the publish), then `tar -czf -C build .`
  (~3 MB) and `POST /spa/publish` on :9001 with the same `DEPLOY_TOKEN`.
- **Publish**: the server unpacks into `build.next`, requires
  `index.html` at its root, then swaps `build` → `build.old` and
  `build.next` → `build`. A failed upload or tarball leaves the live
  bundle untouched.
- **No restart**: PocketBase reads `publicDir` on every request, so a
  frontend deploy never bounces the API. `POST /spa/rollback` swaps back
  to `build.old`; calling it again swaps forward.
- **Reverse proxy**: route `/ai/*`, `/spa/*` and `/repo/*` to :9001 next to
  `/db/sync` (with buffering off for `/ai/`), give `/assets/*` a long
  immutable cache and `/`, `/index.html`, `/sw.js`, `/manifest.json`
  `no-cache` (PB sends no `Cache-Control` of its own).
- `build/`, `build.next/` and `build.old/` are gitignored; they are not
  part of `pb_data` snapshots.
- `PB_PUBLIC_DIR` overrides the served directory; `DEPLOY_BIND` pins the
  deploy server to one address (e.g. the Docker gateway).

## Operations

- **Logs**: `mimi-db.log` in the clone root.
- **Manual start / recovery** (also after a server reboot — nothing
  auto-starts PB; run from the clone root):
  `nohup bun pocketbase/server.ts >> mimi-db.log 2>&1 &`
- **Secrets**: `.env.prod` in the clone root — generated on the box, never
  committed anywhere. `PB_HTTP` sets the address PocketBase binds (e.g.
  `0.0.0.0:8090`); `OPENCODE_API_KEY` is the site AI key. After editing the
  file, restart the supervisor so the relay picks it up.
- **Uninstall**:
    ```bash
    pkill -f 'pocketbase/server.ts'; pkill -f 'pocketbase serve'
    ( crontab -l | grep -v mimi-db ) | crontab -   # removes entries from older installs
    rm -rf <mimi>            # removes the database + files — back up pb_data first
    ```
    (plus remove the site from your reverse proxy and the `DEPLOY_TOKEN`
    secret / workflow URL on GitHub if decommissioning for good)
