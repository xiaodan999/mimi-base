#!/usr/bin/env bash
# Phase 5 server setup for huanan-pc (Aliyun ECS, run as root).
# Idempotent: safe to re-run. Leaves PB running via /root/bin/mimi-db
# (started at boot via an @reboot cron entry; deploys arrive via GitHub
# Actions POSTing /db/sync), and prints the values needed for the Caddy + GitHub steps.
set -euo pipefail

REPO=/root/main/mimi-base

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

# 3. secrets (generated on the box, never transited)
if [ ! -f /root/mimi-secrets.txt ]; then
    {
        echo "SUPERUSER_EMAIL=mimi@zxvcn.com"
        echo "SUPERUSER_PASSWORD=$(openssl rand -hex 16)"
        echo "DEPLOY_TOKEN=$(openssl rand -hex 24)"
    } > /root/mimi-secrets.txt
    chmod 600 /root/mimi-secrets.txt
fi
. /root/mimi-secrets.txt

echo "DEPLOY_TOKEN=$DEPLOY_TOKEN" > /root/.mimi-db.env
chmod 600 /root/.mimi-db.env

# 4. supervisor wrapper
mkdir -p /root/bin
cat > /root/bin/mimi-db <<'WRAPPER'
#!/bin/sh
cd /root/main/mimi-base
set -a
. /root/.mimi-db.env
set +a
exec /root/.bun/bin/bun run db -- --http 0.0.0.0:8090 --automigrate=false
WRAPPER
chmod +x /root/bin/mimi-db

# 5. boot persistence: start PB once at boot. No watchdog loop, no auto-deploy:
# deploys arrive via GitHub Actions POSTing /db/sync.
( crontab -l 2>/dev/null | grep -v mimi-db || true
  echo "@reboot sh -c 'nohup /root/bin/mimi-db >> /root/mimi-db.log 2>&1 &'" ) | crontab -

# 6. start (only if not already running) and register the superuser
pgrep -f 'bun pocketbase/server.ts' >/dev/null || \
    { nohup /root/bin/mimi-db >> /root/mimi-db.log 2>&1 & }
sleep 8
cd "$REPO/pocketbase"
if [ ! -x ./pocketbase ]; then echo "waiting for binary download..."; sleep 20; fi
./pocketbase superuser upsert "$SUPERUSER_EMAIL" "$SUPERUSER_PASSWORD" || \
    echo "WARN: superuser upsert failed — is PB up? check /root/mimi-db.log"

# 7. info for the Caddy + GitHub steps
GW=$(docker inspect "$(docker ps -aqf name=caddy)" --format '{{range .NetworkSettings.Networks}}{{.Gateway}} {{end}}' | awk '{print $1}')
echo
echo "================= SETUP DONE ================="
echo "docker gateway for Caddy -> host: $GW  (use in Caddyfile: reverse_proxy $GW:8090 / :9001)"
echo "health check: curl http://127.0.0.1:8090/api/health"
echo "secrets: /root/mimi-secrets.txt (chmod 600)"
echo "  DEPLOY_TOKEN: $DEPLOY_TOKEN   <- also add as the DEPLOY_TOKEN GitHub secret"
echo "  superuser:    $SUPERUSER_EMAIL / $SUPERUSER_PASSWORD"
echo "=============================================="
