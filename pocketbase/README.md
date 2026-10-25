# PocketBase

The database server for mimi-base — a self-contained deployment where
everything lives inside the repo clone:

```
<mimi>/                          # wherever you clone it = the whole deployment
├── .env.prod                    # gitignored: SUPERUSER_*, DEPLOY_TOKEN (chmod 600)
├── mimi-db.log                  # gitignored runtime log
├── scripts/mimi-db              # production launcher (repo-relative paths)
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
bun run db                 # serves on 127.0.0.1:8090, automigrate ON
bun run dev                # frontend on :3000 (VITE_POCKETBASE_URL in .env)
```

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
`.env.prod`, registers one `@reboot` cron entry (starts PB as your user
at boot), downloads the pinned PocketBase binary (v0.40.6), applies the
committed schema and creates the superuser.

It is idempotent: safe to re-run. A re-run refreshes the clone, rewrites
the cron entry and re-upserts the superuser, but never rotates secrets
(delete `.env.prod` first for that — then also update the GitHub
`DEPLOY_TOKEN` secret and restart PB).

Exposing the API to the internet (reverse proxy + TLS) is a separate
concern; the only requirement is that `/api/*` and `/db/sync` are
reachable by your apps and the deploy pipeline.

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

## Operations

- **Logs**: `mimi-db.log` in the clone root.
- **Manual start / recovery**:
  `nohup scripts/mimi-db >> mimi-db.log 2>&1 &`
- **Secrets**: `.env.prod` in the clone root — generated on the box, never
  committed anywhere.
- **Uninstall**:
  ```bash
  pkill -f 'pocketbase/server.ts'; pkill -f 'pocketbase serve'
  ( crontab -l | grep -v mimi-db ) | crontab -
  rm -rf <mimi>            # removes the database + files — back up pb_data first
  ```
  (plus remove the site from your reverse proxy and the `DEPLOY_TOKEN`
  secret / workflow URL on GitHub if decommissioning for good)
