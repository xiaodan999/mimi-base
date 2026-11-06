#!/usr/bin/env bash
# Dedicated Docker network + egress firewall for the code sandbox.
#
# The sandbox keeps real internet access, but this chain only allows DNS
# and HTTP(S) to public addresses. Loopback, private ranges and the host's
# own IPs are dropped, so the container cannot reach PocketBase, the relay,
# Caddy, SSH, or any other service on the machine.
#
# Idempotent; run as root after the Docker daemon is up. The production
# supervisor calls this at startup (see pocketbase/sandbox-exec.ts).
set -euo pipefail

NETWORK=mimi-sandbox
SUBNET=172.31.250.0/24
GATEWAY=172.31.250.1
CHAIN=MIMI-SANDBOX
HOST_CHAIN=MIMI-SANDBOX-HOST

if [ "$(id -u)" -ne 0 ]; then
    echo "sandbox network setup requires root" >&2
    exit 1
fi
for command in docker iptables ip; do
    command -v "$command" >/dev/null 2>&1 || {
        echo "sandbox setup is missing $command" >&2
        exit 1
    }
done

if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
    docker network create \
        --driver bridge \
        --subnet "$SUBNET" \
        --gateway "$GATEWAY" \
        "$NETWORK" >/dev/null
fi

iptables -N DOCKER-USER 2>/dev/null || true
iptables -N "$CHAIN" 2>/dev/null || true
iptables -F "$CHAIN"

# Replies to allowed outbound connections.
iptables -A "$CHAIN" -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT

# Never reach local, private, link-local, CGNAT, multicast or reserved space.
for range in \
    0.0.0.0/8 \
    10.0.0.0/8 \
    100.64.0.0/10 \
    127.0.0.0/8 \
    169.254.0.0/16 \
    172.16.0.0/12 \
    192.0.0.0/24 \
    192.0.2.0/24 \
    192.168.0.0/16 \
    198.18.0.0/15 \
    198.51.100.0/24 \
    203.0.113.0/24 \
    224.0.0.0/4 \
    240.0.0.0/4; do
    iptables -A "$CHAIN" -d "$range" -j DROP
done

# The host's own public addresses (Docker gateway is already covered by
# 172.16/12, but the box is also reachable on its public IP).
while read -r address; do
    [ -n "$address" ] || continue
    iptables -A "$CHAIN" -d "$address" -j DROP
done < <(ip -4 -o addr show scope global | awk '{print $4}' | cut -d/ -f1 | sort -u)

# Public DNS and HTTP(S) only. Everything else is dropped.
iptables -A "$CHAIN" -p udp --dport 53 -j ACCEPT
iptables -A "$CHAIN" -p tcp --dport 53 -j ACCEPT
iptables -A "$CHAIN" -p tcp -m multiport --dports 80,443 -j ACCEPT
iptables -A "$CHAIN" -j DROP

if ! iptables -C DOCKER-USER -s "$SUBNET" -j "$CHAIN" 2>/dev/null; then
    iptables -I DOCKER-USER 1 -s "$SUBNET" -j "$CHAIN"
fi

# Destination-local traffic (the host's own private IPs) bypasses
# DOCKER-USER/FORWARD and hits INPUT. Drop every container -> host packet
# so PocketBase/Caddy/SSH are unreachable even on a host address. Outbound
# internet traffic still goes through FORWARD and is allowed above.
iptables -N "$HOST_CHAIN" 2>/dev/null || true
iptables -F "$HOST_CHAIN"
iptables -A "$HOST_CHAIN" -j DROP
if ! iptables -C INPUT -s "$SUBNET" -j "$HOST_CHAIN" 2>/dev/null; then
    iptables -I INPUT 1 -s "$SUBNET" -j "$HOST_CHAIN"
fi

echo "sandbox network ready: $NETWORK ($SUBNET -> public 53/80/443 only)"
