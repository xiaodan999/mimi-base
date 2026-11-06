#!/usr/bin/env bash
# Idempotent installer for the mimi-base production host.
#
# Installs the version-controlled systemd unit and the Caddy / compose config.
# This is a CONFIG artifact: review it, then run it ON the host as root. It is
# never executed as part of a git checkout or CI. See deploy/README.md.
#
#   sudo bash deploy/setup.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_SRC="$REPO/deploy/mimi-base.service"
UNIT_DST="/etc/systemd/system/mimi-base.service"
PROXY_DIR="${MIMI_PROXY_DIR:-/root/main}"

if [ "$(id -u)" -ne 0 ]; then
    echo "run as root (sudo bash deploy/setup.sh)" >&2
    exit 1
fi

# 1. A bare `nohup bun pocketbase/server.ts` (from an older install) would
#    collide with the systemd unit via the prod single-instance lock. Stop it
#    so systemd owns exactly one supervisor.
if pgrep -f 'pocketbase/server.ts' >/dev/null 2>&1; then
    echo "stopping the bare (non-systemd) supervisor before enabling the unit..."
    pkill -f 'pocketbase/server.ts' || true
    sleep 2
fi

# 2. systemd unit: Restart=always + ExecStartPost health polling.
install -m 0644 "$UNIT_SRC" "$UNIT_DST"
systemctl daemon-reload
systemctl enable mimi-base.service
echo "installed + enabled $UNIT_DST"
echo "  start it with: systemctl start mimi-base.service"
echo "  status:        systemctl status mimi-base.service"
echo "  (the unit's ExecStartPost polls /api/health before reporting started)"

# 3. Reverse proxy: back up any hand-edited files, then install the
#    version-controlled ones. Other vhosts on the host must be merged into the
#    Caddyfile — this file owns only the dan-pb.zxvcn.com site block.
if [ -d "$PROXY_DIR" ]; then
    STAMP="$(date +%Y%m%d-%H%M%S)"
    for f in Caddyfile compose.yaml; do
        if [ -f "$PROXY_DIR/$f" ]; then
            cp -a "$PROXY_DIR/$f" "$PROXY_DIR/$f.bak-$STAMP"
            echo "backed up $PROXY_DIR/$f -> $f.bak-$STAMP"
        fi
    done
else
    mkdir -p "$PROXY_DIR"
fi
install -m 0644 "$REPO/deploy/Caddyfile" "$PROXY_DIR/Caddyfile"
install -m 0644 "$REPO/deploy/compose.yaml" "$PROXY_DIR/compose.yaml"
echo "installed $PROXY_DIR/Caddyfile + compose.yaml"
echo "  WARNING: if this host serves other domains, re-add their site blocks"
echo "  from the .bak-* files before reloading Caddy."
echo "  reload:  docker compose -f $PROXY_DIR/compose.yaml up -d"

echo "setup files installed. They are NOT applied by CI; run this on the host."
