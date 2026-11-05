# PocketBase

The database server for mimi-base — a self-contained deployment where
everything lives inside the repo clone:

```
<mimi>/                          # wherever you clone it = the whole deployment
├── .env.prod                    # gitignored: SUPERUSER_*, DEPLOY_TOKEN,
│                                #   PB_HTTP (chmod 600)
├── mimi-db.log                  # gitignored runtime log
├── scripts/server-setup.sh      # one-command server setup (idempotent)
└── pocketbase/                  # this dir:
    ├── server.ts                # supervisor: spawns the pinned PB binary and
    │                            #   serves the token-protected /db/sync deploy
    │                            #   endpoint on :9001
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
started. In the split flow, keep `VITE_POCKETBASE_URL` in `.env` in sync.

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
concern; the only requirement is that `/api/*`, `/db/sync` (and `/spa/*`
when self-hosting the frontend) are reachable by your apps and the deploy
pipeline.

## Deploys

Push to `master` touching `pocketbase/**` → GitHub Actions calls the
token-protected `/db/sync` endpoint (`DEPLOY_TOKEN` secret in the
"Production" environment) → the server does `git pull --ff-only`,
snapshots `pb_data`, restarts PB and returns 200 only after `/api/health`
passes. The trigger step retries 8 times over ~8 minutes to ride out
transient route failures; a red run means the deploy did NOT happen
(re-run the job from the Actions tab).

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
- **Reverse proxy**: route `/spa/*` to :9001 next to `/db/sync`, give
  `/assets/*` a long immutable cache and `/`, `/index.html`, `/sw.js`,
  `/manifest.json` `no-cache` (PB sends no `Cache-Control` of its own).
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
  committed anywhere. `PB_HTTP` in the same file sets the address
  PocketBase binds (e.g. `0.0.0.0:8090`).
- **Uninstall**:
    ```bash
    pkill -f 'pocketbase/server.ts'; pkill -f 'pocketbase serve'
    ( crontab -l | grep -v mimi-db ) | crontab -   # removes entries from older installs
    rm -rf <mimi>            # removes the database + files — back up pb_data first
    ```
    (plus remove the site from your reverse proxy and the `DEPLOY_TOKEN`
    secret / workflow URL on GitHub if decommissioning for good)
