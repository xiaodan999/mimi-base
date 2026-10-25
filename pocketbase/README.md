# PocketBase

Schema, hooks and supervisor for mimi-base. Deployed to huanan-pc, fronted by
Caddy at https://dan-pb.zxvcn.com.

## Local dev

```
bun run db                 # serves on 127.0.0.1:8090, automigrate ON
bun run dev                # frontend on :3000 (VITE_POCKETBASE_URL in .env)
```

Admin UI: http://127.0.0.1:8090/_/ (dev superuser creds in the team's vault).

## Production (huanan-pc)

- Repo at `/root/main/mimi-base`, PB binary in `pocketbase/` (pinned v0.40.6).
- Supervisor: `/root/bin/mimi-db` (`bun run db -- --http 0.0.0.0:8090
  --automigrate=false`), started once at boot via an `@reboot` cron entry;
  logs `/root/mimi-db.log`. No watchdog loop — if PB dies, start it with
  `nohup /root/bin/mimi-db >> /root/mimi-db.log 2>&1 &`.
- Secrets: `/root/mimi-secrets.txt` + `/root/.mimi-db.env` (chmod 600).
- Caddy (Docker) serves `dan-pb.zxvcn.com` → `172.19.0.1:8090`
  (`:9001` for `/db/sync`), config inside the container.

## Deploys

Push to `master` touching `pocketbase/**` → GitHub Actions POSTs
`/db/sync` (token: `DEPLOY_TOKEN` secret) → the server does
`git pull --ff-only`, snapshots `pb_data` to `pb_data_snapshots/` (last 5),
restarts PB and returns 200 only after `/api/health` passes.
If `server.ts` itself changed, the supervisor exits and the watchdog
restarts it with the new version.

Deploy history: first genuine Actions deploy verified 2026-10-25 (earlier
"successes" were masked 401s from a stale secret). Actions-only since — the
watchdog was removed at the owner's request, so a failed run means the
deploy did NOT happen (re-run the job from the Actions tab; the trigger
step retries 8 times over ~8 min for CN-route flakiness). Manual deploy:
`curl -X POST https://dan-pb.zxvcn.com/db/sync -H "x-deploy-token: $DEPLOY_TOKEN"`.
