#!/usr/bin/env bash
# Server setup for the PocketBase host. Runs as a NORMAL user — everything
# (bun install, the PocketBase process on 8090/9001) is user-level; only the
# reverse proxy / TLS step needs root.
#
# Everything lives inside the repo clone: the supervisor (pocketbase/server.ts,
# started as plain `bun run db`), the secrets file (.env.prod, gitignored)
# and the log (mimi-db.log). This script only starts the process immediately
# when nothing is running yet; nothing restarts it after a crash or a reboot,
# so restart it by hand if the box goes down (the final echo prints the command).
#
# Usage:
#   git clone https://github.com/xiaodan999/mimi-base && cd mimi-base
#   export SUPERUSER_EMAIL="you@example.com"
#   bash scripts/server-setup.sh
#
# If run standalone (e.g. `bash <(curl ...)`), it clones the repo into the
# CURRENT directory instead. Idempotent: safe to re-run.
set -euo pipefail

# 1. locate the repo: use the clone this script lives in, else clone into cwd
SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd || pwd)"
if REPO="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
    echo "using existing clone: $REPO"
else
    [ -d mimi-base ] || git clone https://github.com/xiaodan999/mimi-base
    REPO="$(pwd)/mimi-base"
fi
cd "$REPO"
git config pull.ff only
git pull --ff-only || echo "WARN: git pull failed (continue with current tree)"

# 2. bun
if ! command -v bun >/dev/null 2>&1; then
    curl -fsSL https://bun.sh/install | bash
fi
export PATH="$HOME/.bun/bin:$PATH"
echo "bun: $(bun --version)"

# 3. secrets (generated on the box, never transited) -> .env.prod (gitignored).
#    The superuser email is yours to choose — export SUPERUSER_EMAIL before running.
#    Secrets are NEVER printed to stdout; read them from the file if needed.
if [ ! -f .env.prod ]; then
    : "${SUPERUSER_EMAIL:?export SUPERUSER_EMAIL first}"
    {
        echo "SUPERUSER_EMAIL=$SUPERUSER_EMAIL"
        echo "SUPERUSER_PASSWORD=$(openssl rand -hex 16)"
        echo "DEPLOY_TOKEN=$(openssl rand -hex 24)"
        # Deploy endpoints (:9001) bind to loopback by default. Set a
        # non-loopback value AND DEPLOY_BIND_ALLOW_PUBLIC=1 only when Caddy
        # runs in Docker and must reach them via host.docker.internal (the
        # cloud security group still blocks external probes to :9001).
        echo "DEPLOY_BIND=127.0.0.1"
        # PB itself must listen on a host-reachable address for Caddy (and the
        # SPA/API); external access to :8090 is blocked by the cloud SG.
        echo "PB_HTTP=0.0.0.0:8090"
    } > .env.prod
    chmod 600 .env.prod
fi
# The deploy secret is the single DEPLOY_TOKEN (see pocketbase/README.md); set the
# same value as the GitHub "Production" environment secret.
. .env.prod

# 4. clean up any legacy mimi-db cron entries from older installs
#    (boot-start is now handled by the systemd unit, not cron)
( crontab -l 2>/dev/null | grep -v mimi-db || true ) | crontab -

# 5. start (only if not already running) and register the superuser
pgrep -f 'pocketbase/server.ts' >/dev/null || \
    { nohup bun pocketbase/server.ts >> mimi-db.log 2>&1 & }
sleep 8
cd pocketbase
if [ ! -x ./pocketbase ]; then echo "waiting for binary download..."; sleep 20; fi
# apply the committed schema (needed on a fresh pb_data; no-op when applied)
./pocketbase migrate up || echo "WARN: migrate up failed — check pb_migrations"

# PocketBase 0.40.6 `superuser upsert` accepts the password ONLY as a
# positional argument (there is no --password/stdin/env flag). Source it from
# the environment (.env.prod), put it in a 0600 temp file, never echo it, never
# leave it in a long-lived process environment, and shred the file. Brief argv
# exposure on the short-lived pocketbase call is a CLI limitation; set
# SUPERUSER_PASSWORD in the environment (it is never printed) to override.
PW_FILE="$(mktemp)"; chmod 600 "$PW_FILE"
printf '%s' "$SUPERUSER_PASSWORD" > "$PW_FILE"
./pocketbase superuser upsert "$SUPERUSER_EMAIL" "$(cat "$PW_FILE")" >/dev/null || \
    echo "WARN: superuser upsert failed — is PB up? check $REPO/mimi-db.log"
shred -u "$PW_FILE" 2>/dev/null || rm -f "$PW_FILE"
cd "$REPO"

# 6. info for the GitHub + proxy steps (NO secrets echoed)
echo
echo "================= SETUP DONE ================="
echo "repo:    $REPO"
echo "log:     $REPO/mimi-db.log"
echo "secrets: $REPO/.env.prod (chmod 600) — read DEPLOY_TOKEN / SUPERUSER_PASSWORD there,"
echo "         add DEPLOY_TOKEN as the GitHub 'Production' secret; never paste it to stdout/log"
echo "health check: curl http://127.0.0.1:8090/api/health"
echo "restart:     cd $REPO && setsid nohup bun pocketbase/server.ts >> mimi-db.log 2>&1 < /dev/null &"
echo "systemd:     none — the supervisor is started detached and is not restarted automatically"
echo "frontend:    run the deploy-spa workflow once (Actions -> Run workflow);"
echo "             PB serves $REPO/build, / returns 404 until it is published"
echo "=============================================="
