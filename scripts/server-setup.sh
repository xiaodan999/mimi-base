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

# Runtime dependencies for the supervisor live in pocketbase/package.json
# (pdf.js / @napi-rs/canvas for chat attachments). The browser build happens
# elsewhere; the server needs only its own production deps.
echo "installing server dependencies (production)..."
( cd pocketbase && bun install --frozen-lockfile --production )

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
        # Site AI (OpenCode Go). Fill this in after setup and restart the
        # supervisor; until then AI features answer 503. The key never leaves
        # the server and is not forwarded to PocketBase.
        echo "OPENCODE_API_KEY="
        echo "OPENCODE_MODEL=deepseek-v4.1-flash"
        echo "AI_DAILY_REQUESTS_PER_USER=100"
    } > .env.prod
    chmod 600 .env.prod
fi
# The deploy secret is the single DEPLOY_TOKEN (see pocketbase/README.md); set the
# same value as the GitHub "Production" environment secret.
. .env.prod

# Video compression needs ffmpeg. It is optional — without it the app still
# publishes, but the original (up to 50MB) is stored and loaded. Install it
# here when we have root so a fresh box compresses from its first post; with
# neither root nor passwordless sudo we print the command and keep going.
FFMPEG_BIN="${FFMPEG_PATH:-$(command -v ffmpeg || true)}"
if [ -z "$FFMPEG_BIN" ] || [ ! -x "$FFMPEG_BIN" ]; then
    FFMPEG_SUDO=""
    if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 \
        && sudo -n true 2>/dev/null; then
        FFMPEG_SUDO="sudo -n"
    fi
    if [ "$(id -u)" -eq 0 ] || [ -n "$FFMPEG_SUDO" ]; then
        echo "installing ffmpeg (video compression)..."
        if command -v apt-get >/dev/null 2>&1; then
            $FFMPEG_SUDO env DEBIAN_FRONTEND=noninteractive \
                apt-get update -qq || true
            $FFMPEG_SUDO env DEBIAN_FRONTEND=noninteractive \
                apt-get install -y -qq ffmpeg || true
        elif command -v dnf >/dev/null 2>&1; then
            $FFMPEG_SUDO dnf install -y -q ffmpeg || true
        elif command -v apk >/dev/null 2>&1; then
            $FFMPEG_SUDO apk add --no-cache ffmpeg || true
        fi
        FFMPEG_BIN="$(command -v ffmpeg || true)"
    fi
fi
if [ -n "$FFMPEG_BIN" ] && [ -x "$FFMPEG_BIN" ]; then
    echo "ffmpeg: $("$FFMPEG_BIN" -version 2>/dev/null | head -n1)"
else
    echo "WARN: ffmpeg not found — video posts will upload uncompressed."
    echo "      Debian/Ubuntu: sudo apt-get install -y ffmpeg"
    echo "      Fedora/RHEL:   sudo dnf install -y ffmpeg"
    echo "      Alpine:        sudo apk add ffmpeg"
    echo "      Then restart the supervisor (or set FFMPEG_PATH in .env.prod)."
fi

# 4. clean up any legacy mimi-db cron entries from older installs
#    (older installs started PB from cron; nothing auto-starts it today —
#    after a reboot the supervisor is started by hand, see the hint below)
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
echo "AI:          edit $REPO/.env.prod -> OPENCODE_API_KEY=... then restart the supervisor;"
echo "             reverse proxy: /api/* -> 127.0.0.1:9001 (buffering off),"
echo "             /db/* -> 127.0.0.1:8090 after stripping /db; keep /db/sync exact"
echo "feedback:    set GITHUB_TOKEN / GITHUB_REPO in .env.prod; endpoint is /api/feedback/report"
echo "restart:     cd $REPO && setsid nohup bun pocketbase/server.ts >> mimi-db.log 2>&1 < /dev/null &"
echo "systemd:     none — the supervisor is started detached and is not restarted automatically"
echo "frontend:    run the deploy-spa workflow once (Actions -> Run workflow);"
echo "             PB serves $REPO/build, / returns 404 until it is published"
echo "=============================================="
