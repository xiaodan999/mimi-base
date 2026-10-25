# PocketBase

Schema, hooks and supervisor for mimi-base.

## Local dev

```
bun run db                 # serves on 127.0.0.1:8090, automigrate ON
bun run dev                # frontend on :3000 (VITE_POCKETBASE_URL in .env)
```

Admin UI: http://127.0.0.1:8090/_/

## Deploys

Push to `master` touching `pocketbase/**` → GitHub Actions calls a
token-protected `/db/sync` endpoint (`DEPLOY_TOKEN` secret in the
"Production" environment) → the server does `git pull --ff-only`,
snapshots `pb_data`, restarts PB and returns 200 only after
`/api/health` passes. The trigger step retries 8 times over ~8 minutes
to ride out transient route failures; a red run means the deploy did
NOT happen (re-run the job from the Actions tab).

Host names, paths and secrets live in the owner's private notes, not
in this public repo.
