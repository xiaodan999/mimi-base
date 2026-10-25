#!/usr/bin/env bash
# Server setup for the PocketBase host (run as root ON the server).
# Everything lives inside the cloned repo: the launcher (scripts/mimi-db),
# the secrets file (.env.prod, gitignored) and the log (mimi-db.log).
# Idempotent: safe to re-run. Deploys arrive via GitHub Actions POSTing
# /db/sync. Override the install location with: REPO=/path bash server-setup.sh
set -euo pipefail

REPO="${REPO:-/root/mimi-base}"

# 1. bun
if ! command -v bun >/dev/null 2>&1; then
    curl -fsSL https://bun.sh/install | bash
fi
export PATH="$HOME/.bun/bin:$PATH"
echo "bun: $(bun --version)"

# 2. repo (public clone; /db/sync later pulls the same way, no credentials)
if [ ! -d "$REPO" ]; then
    git clone https://github.com/xiaodan999/mimi-base "$REPO"
fi
cd "$REPO"
git config pull.ff only
git pull --ff-only || echo "WARN: git pull failed (continue with current tree)"

# 3. secrets (generated on the box, never transited) -> .env.prod (gitignored).
#    The superuser email is yours to choose — export SUPERUSER_EMAIL before running.
if [ ! -f "$REPO/.env.prod" ]; then
    {
        echo "SUPERUSER_EMAIL=${SUPERUSER_EMAIL:?export SUPERUSER_EMAIL first}"
        echo "SUPERUSER_PASSWORD=$(openssl rand -hex 16)"
        echo "DEPLOY_TOKEN=$(openssl rand -hex 24)"
    } > "$REPO/.env.prod"
    chmod 600 "$REPO/.env.prod"
fi
. "$REPO/.env.prod"

# 4. the launcher is committed at scripts/mimi-db — just ensure it is executable
chmod +x "$REPO/scripts/mimi-db"

# 5. boot persistence: start PB once at boot. No watchdog loop, no auto-deploy:
# deploys arrive via GitHub Actions POSTing /db/sync. (Cron needs absolute
# paths, but they all point inside the repo.)
( crontab -l 2>/dev/null | grep -v mimi-db || true
  echo "@reboot sh -c 'nohup $REPO/scripts/mimi-db >> $REPO/mimi-db.log 2>&1 &'" ) | crontab -

# 6. start (only if not already running) and register the superuser
pgrep -f 'pocketbase/server.ts' >/dev/null || \
    { nohup "$REPO/scripts/mimi-db" >> "$REPO/mimi-db.log" 2>&1 & }
sleep 8
cd "$REPO/pocketbase"
if [ ! -x ./pocketbase ]; then echo "waiting for binary download..."; sleep 20; fi
# apply the committed schema (needed on a fresh pb_data; no-op when applied)
./pocketbase migrate up || echo "WARN: migrate up failed — check pb_migrations"
./pocketbase superuser upsert "$SUPERUSER_EMAIL" "$SUPERUSER_PASSWORD" || \
    echo "WARN: superuser upsert failed — is PB up? check $REPO/mimi-db.log"

# 7. info for the Caddy + GitHub steps
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
