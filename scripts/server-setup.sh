#!/usr/bin/env bash
# Server setup for the PocketBase host. Runs as a NORMAL user — everything
# (bun install, the PocketBase process on 8090/9001) is user-level; only
# your reverse proxy / TLS step needs root.
#
# Everything lives inside the repo clone: the launcher (scripts/mimi-db),
# the secrets file (.env.prod, gitignored) and the log (mimi-db.log).
# No cron entries or services are installed — PB does not auto-start at boot.
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
if [ ! -f .env.prod ]; then
    : "${SUPERUSER_EMAIL:?export SUPERUSER_EMAIL first}"
    {
        echo "SUPERUSER_EMAIL=$SUPERUSER_EMAIL"
        echo "SUPERUSER_PASSWORD=$(openssl rand -hex 16)"
        echo "DEPLOY_TOKEN=$(openssl rand -hex 24)"
    } > .env.prod
    chmod 600 .env.prod
fi
. .env.prod

# 4. the launcher is committed at scripts/mimi-db — just ensure it is executable
chmod +x scripts/mimi-db

# 5. clean up any legacy mimi-db cron entries from older installs
#    (boot-start was removed: PB does not auto-start at boot)
( crontab -l 2>/dev/null | grep -v mimi-db || true ) | crontab -

# 6. start (only if not already running) and register the superuser
pgrep -f 'pocketbase/server.ts' >/dev/null || \
    { nohup scripts/mimi-db >> mimi-db.log 2>&1 & }
sleep 8
cd pocketbase
if [ ! -x ./pocketbase ]; then echo "waiting for binary download..."; sleep 20; fi
# apply the committed schema (needed on a fresh pb_data; no-op when applied)
./pocketbase migrate up || echo "WARN: migrate up failed — check pb_migrations"
./pocketbase superuser upsert "$SUPERUSER_EMAIL" "$SUPERUSER_PASSWORD" || \
    echo "WARN: superuser upsert failed — is PB up? check $REPO/mimi-db.log"

# 7. info for the reverse-proxy + GitHub steps
GW=$(docker inspect "$(docker ps -aqf name=caddy 2>/dev/null)" \
        --format '{{range .NetworkSettings.Networks}}{{.Gateway}} {{end}}' 2>/dev/null \
     | awk '{print $1}' || true)
echo
echo "================= SETUP DONE ================="
echo "repo:    $REPO"
echo "log:     $REPO/mimi-db.log"
echo "secrets: $REPO/.env.prod (chmod 600)"
echo "caddy gateway: ${GW:-none — proxy to 127.0.0.1:8090 / :9001 directly}"
echo "health check: curl http://127.0.0.1:8090/api/health"
echo "  DEPLOY_TOKEN: $DEPLOY_TOKEN   <- also add as the DEPLOY_TOKEN GitHub secret"
echo "  superuser:    $SUPERUSER_EMAIL / $SUPERUSER_PASSWORD"
echo "=============================================="
