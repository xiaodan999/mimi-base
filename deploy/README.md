# Deployment & operations (mimi-base)

Version-controlled ops config for the self-hosted PocketBase host (`huanan-pc`).
These files are **config only** — nothing here is applied automatically by CI or
by a git checkout. `deploy/setup.sh` is the (manual, root) installer,
`deploy/mimi-base.service` is the systemd unit, `deploy/Caddyfile` +
`deploy/compose.yaml` are the reverse proxy.

Architecture: one Bun supervisor (`pocketbase/server.ts`) runs PocketBase
(`--publicDir ../build`, `--automigrate=false`) and exposes the deploy endpoints
on `:9001`. Caddy fronts `:8090` (SPA + API + dashboard) and `:9001` (deploy
endpoints) at `dan-pb.zxvcn.com`.

---

## 1. CI gating and serialization (issue #11)

`ci.yml` is reusable (`workflow_call`) and runs the full checks:
typecheck, lint, `format:check`, unit tests, build.

Both `deploy-db.yml` and `deploy-spa.yml` have a `ci` job that
`uses: ./.github/workflows/ci.yml`, and their deploy jobs declare `needs: ci`.
A publish therefore cannot run until a successful CI run. Each deploy build
inherits that CI result (and `deploy-spa`'s `build` job does the real `bun run
build` for the artifact).

Both deploy workflows use the **same** `concurrency.group: deploy` with
`cancel-in-progress: false`. A commit touching both `pocketbase/**` and the
frontend can never run `/db/sync` (PB restart) and `/spa/publish` at the same
time — they queue on one repo-wide group. Both keep `workflow_dispatch` for the
first publish / manual republish / recovery.

---

## 2. Deploy endpoints, auth, and checkout sync (issues #12, #14, #17)

| Endpoint             | Purpose                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /db/sync`      | `git pull --ff-only` → stop PB → **validated** `pb_data` snapshot → start PB → respond after `/api/health` passes. A snapshot failure **aborts** (see §3). |
| `POST /repo/sync`    | `git pull --ff-only` **only**. No PB stop/restart. Returns the resulting `HEAD`.                                                                           |
| `POST /spa/publish`  | Hash-verify + member-validate a tarball, extract into a generation, atomically flip the `build` symlink.                                                   |
| `POST /spa/rollback` | Flip `build` back to the previous generation.                                                                                                              |

**`/spa/publish` does NOT update server code.** It only swaps the frontend
bundle. `deploy-spa.yml` calls `/repo/sync` right after a successful publish so
the on-disk checkout reaches the deployed commit without a PB restart; the
response `HEAD` is asserted to equal `github.sha` (#12). Changes under
`pocketbase/**` are handled by `deploy-db`'s `/db/sync` (pull + backup +
restart), which is where migrations apply.

### Token

CI authenticates with a single shared secret, `DEPLOY_TOKEN`, set in the GitHub
`Production` environment and as `DEPLOY_TOKEN=<value>` in the host's
`.env.prod` (gitignored, `chmod 600`). It authorizes every deploy endpoint.
`scripts/server-setup.sh` never echoes it. If it is unset the deploy server does
not start at all, and the workflows skip cleanly.

### Timestamped HMAC

Preferred auth is an HMAC signature over `"<pathname>.<ts>"` (hex), with a
300-second freshness window to stop replay:

```
TS=$(date +%s)
SIG=$(printf '%s' "/spa/publish.$TS" | openssl dgst -sha256 -hmac "$TOKEN" | awk '{print $NF}')
curl -X POST ... -H "x-deploy-ts: $TS" -H "x-deploy-signature: $SIG" ...
```

The legacy `x-deploy-token` bearer is still accepted as a fallback so a CI
still sending only the static token keeps working; operators may stop sending
`x-deploy-token` once HMAC is verified in production. `DEPLOY_BIND` defaults to
`127.0.0.1`; a non-loopback bind additionally requires
`DEPLOY_BIND_ALLOW_PUBLIC=1` (when Caddy runs in Docker and reaches `:9001`
via `host.docker.internal`, set `DEPLOY_BIND=0.0.0.0` plus that opt-in — the
cloud security group blocks external probes to `:9001`).

### Minimal `pbEnv`

`server.ts` builds an allowlisted environment for the PocketBase child
(`PATH`, `HOME`, `TZ`, proxy vars, plus `MIMI_DEV` in dev only). Deploy secrets
and the rest of `process.env` are **not** forwarded to the PB process.

---

## 3. Snapshots and restore (issue #13)

Snapshots live in `pb_data_snapshots/` (gitignored). A snapshot is only kept
after validation: size floor, `tar -tzf` succeeds, and the archive contains
`pb_data/data.db`. Pruning re-validates every archive and deletes invalid ones,
so empty/corrupt archives never count toward `SNAPSHOT_KEEP` (5).

`restartPB` runs the snapshot while PB is stopped. If the snapshot fails, the
restart is **aborted**: PB is NOT started, so the just-pulled migrations cannot
apply without a verified backup. `/db/sync` returns 500 with a message pointing
here. The data on disk at that point is intact (PB was stopped cleanly, no
migrations ran).

List/verify snapshots:

```bash
cd /root/mimi-base
ls -lt pb_data_snapshots/
tar -tzf pb_data_snapshots/<name>.tar.gz | grep pb_data/data.db   # must exist
```

### Recovery after a snapshot-failure abort

1. Confirm PB is down: `curl http://127.0.0.1:8090/api/health` fails. Do **not** start it manually; `systemctl` will restart it into the same state.
2. Take a manual, validated snapshot of the intact data:
    ```bash
    cd /root/mimi-base
    tar -czf pb_data_snapshots/manual-$(date +%Y%m%d-%H%M%S).tar.gz \
        -C pocketbase pb_data
    tar -tzf pb_data_snapshots/manual-*.tar.gz | grep pb_data/data.db
    ```
3. Re-run the `deploy-db` workflow (or `POST /db/sync`). It will snapshot again and, on success, start PB so migrations apply **with** a backup present.
4. Verify `curl https://dan-pb.zxvcn.com/api/health` and spot-check the data.

### Full restore from a validated snapshot (data loss / bad migration)

```bash
sudo systemctl stop mimi-base            # PB + supervisor down
cd /root/mimi-base
rm -rf pocketbase/pb_data                # move it aside first if you want to keep it
tar -xzf pb_data_snapshots/<name>.tar.gz -C pocketbase   # archive contains pb_data/
sudo systemctl start mimi-base
curl http://127.0.0.1:8090/api/health
```

The archive is created with `-C pocketbase pb_data`, so extracting with
`-C pocketbase` restores `pocketbase/pb_data/`. With `--automigrate=false`
prod still applies committed migrations on start, so a restored older dataset
will be migrated forward again — but always from a known-good backup.

---

## 4. SPA artifact integrity, atomic swap, versioning (issue #14)

`deploy-spa.yml` builds, tars `build/`, and computes `sha256sum spa.tar.gz`.
`server.ts` verifies, **before writing or extracting anything**:

- `x-spa-sha256` equals the server-computed SHA-256 of the request body;
- every tar member via `tar -tzf` / `tar -tvzf` — no absolute paths, no `..`,
  no symlinks/hardlinks/devices/fifos, capped member count;
- extraction uses `--no-same-owner --no-same-permissions`;
- post-extraction tree is walked with `lstat` (rejects symlinks) and the total
  extracted size is capped.

`build` is a **symlink** into `build.next/gen-*` generations. The swap is a
**single atomic `rename`** of a temp symlink (no window without `build/`).
`BUILD_KEEP` (3) generations are retained, so `/spa/rollback` flips back. The
first publish on an older layout migrates a real `build/` dir into a generation
and replaces it with the symlink at startup.

`x-spa-sha` carries the commit sha. The build's `sw-version` Vite plugin
(`vite.config.ts`) injects `VERSION` into `build/sw.js` from `package.json` +
the commit sha and writes `build/version.json` (`{ version, sha, ... }`). The
server checks `version.json.sha` against `x-spa-sha` when present. After a
publish, the workflow fetches `/version.json` and asserts its `sha` equals
`github.sha` — a 200 that serves stale code fails the deploy. `APP_VERSION` is
read from `package.json` (not the undefined `npm_package_version`).

---

## 5. systemd, health checks, single-instance lock (issue #15)

`deploy/mimi-base.service`:

```
WorkingDirectory=/root/mimi-base
ExecStart=/root/.bun/bin/bun pocketbase/server.ts
Restart=always
```

`ExecStartPost` polls `/api/health` before the unit reports started, and
`Restart=always` covers crashes and reboots. Install/enable:

```bash
sudo bash deploy/setup.sh                 # installs unit + proxy config
sudo systemctl enable --now mimi-base.service
systemctl status mimi-base.service
journalctl -u mimi-base -f
```

`server.ts` also:

- verifies the **new** supervisor is healthy (child alive + its PB answers
  `/api/health`) before the old one `process.exit(0)` during a `server.ts`
  self-respawn; if it is not healthy, the old supervisor keeps serving and
  restarts its own PB. The new supervisor retries binding `:9001` while the
  old one winds down.
- writes a prod single-instance lock (`pb_data/.dev-server.json`) and refuses
  to start when a live supervisor already owns the data dir; the intended
  respawn replacement is exempt (`MIMI_RESPAWN_CHILD=1`).

---

## 6. Reverse proxy / IaC (issue #17)

`deploy/Caddyfile` + `deploy/compose.yaml` are version controlled (the old
`/root/main` was not a git repo). They replace the hardcoded `172.19.0.1`
gateway with:

```yaml
extra_hosts:
    - "host.docker.internal:host-gateway"
```

and `reverse_proxy host.docker.internal:9001` / `:8090`. `caddy-net` stays an
`external: true` network so Compose never recreates it. Caching mirrors
`vercel.json`: `no-cache` on `/`, `/index.html`, `/sw.js`, `/manifest.json`,
`/version.json`; immutable on `/assets/*`; SWR on `/images/*`.

`deploy/setup.sh` backs up any hand-edited `/root/main/Caddyfile` /
`compose.yaml` to `.bak-<timestamp>` before installing these, and warns that
other vhosts on the host must be merged back in.

`scripts/server-setup.sh` no longer prints `DEPLOY_TOKEN` or the superuser
password to stdout and no longer passes the password as a literal on the
command line. PocketBase 0.40.6 `superuser upsert` accepts the password **only**
as a positional argument (no `--password`/stdin/env flag — verified), so the
script sources it from the environment, writes it to a `0600` temp file, uses
command substitution, and shreds the file; the brief argv exposure on the
short-lived call is a documented CLI limitation. Secrets are only ever read
from `/root/mimi-base/.env.prod` (`chmod 600`).

---

## 7. Vercel / two origins (issue #18)

`vercel.json` sets `framework: vite`, `buildCommand: bun run build`,
`outputDirectory: build`, and the same `no-cache` headers as Caddy. Vercel
**must** set the environment variable
`VITE_POCKETBASE_URL=https://dan-pb.zxvcn.com` (absolute), because
`lib/env.ts` throws at module load for `same-origin` / loopback values on a
separate origin. The two hosts are separate origins: their Service Worker
caches and `localStorage` (`mimi:ai:v1`, `mimi-theme`, `mimi:ai-cache:v1:*`)
are independent, so users of both re-enter the AI key and see different cached
results. This is accepted; the canonical entry point is `dan-pb.zxvcn.com`.
