/**
 * PocketBase supervisor + deploy endpoint.
 *
 *   bun run db                                              # dev: 127.0.0.1:8090
 *   bun run db -- --http 0.0.0.0:8090 --automigrate=false   # prod
 *
 * Downloads the pinned binary on first run, keeps `./pocketbase serve`
 * running, and serves POST /db/sync on :9001 for GitHub Actions deploys:
 * auth token (x-deploy-token, timing-safe compare) -> git pull --ff-only ->
 * pb_data snapshot -> restart -> respond only after /api/health passes.
 *
 * Must stay inside pocketbase/: the binary resolves pb_migrations and
 * pb_hooks relative to the data dir (pocketbase/pb_data/../).
 *
 * NOTE: /db/sync restarts PocketBase only. If the pull changed server.ts
 * itself, the supervisor exits after responding so the prod cron watchdog
 * (or a manual local restart) starts the new version.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import path from "node:path";

const PB_VERSION = "0.40.6";
const dir = import.meta.dir; // .../pocketbase
const bin = path.join(dir, "pocketbase");
const repo = path.resolve(dir, "..");
const DEPLOY_PORT = 9001;
const SNAPSHOT_KEEP = 5;

async function ensureBinary() {
    if (existsSync(bin)) return;
    const url = `https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip`;
    console.log(`downloading PocketBase v${PB_VERSION}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
    const zip = path.join(dir, "pocketbase.zip");
    await Bun.write(zip, res);
    execSync("unzip -o pocketbase.zip && rm pocketbase.zip", { cwd: dir, stdio: "inherit" });
    chmodSync(bin, 0o755);
}

const argv = process.argv.slice(2);
const serveArgs = [
    "serve",
    ...(argv.some((a) => a.startsWith("--http"))
        ? argv
        : ["--http", "127.0.0.1:8090", ...argv]),
];
const httpPort = (() => {
    const i = serveArgs.indexOf("--http");
    if (i === -1) return 8090;
    return Number(serveArgs[i + 1]?.split(":").pop()) || 8090;
})();

let child: ChildProcess | null = null;
let stopping = false;
let manualRestart = false;

const onSignal = () => {
    stopping = true;
    child?.kill("SIGTERM");
    process.exit(0);
};
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);

function spawnPB() {
    console.log(`starting: pocketbase ${serveArgs.join(" ")}`);
    child = spawn(bin, serveArgs, { cwd: dir, stdio: "inherit" });
    child.on("exit", (code, signal) => {
        if (stopping || manualRestart) return;
        console.error(`pocketbase exited (code=${code} signal=${signal}), restarting in 2s`);
        setTimeout(spawnPB, 2000);
    });
}

/** Kill the current PB and spawn a fresh one from disk; resolves when the new child is up. */
function restartPB(): Promise<void> {
    return new Promise((resolve) => {
        if (!child) {
            spawnPB();
            return resolve();
        }
        const dying = child;
        manualRestart = true;
        dying.on("exit", () => {
            manualRestart = false;
            spawnPB();
            resolve();
        });
        dying.kill("SIGTERM");
    });
}

async function waitForHealth(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`http://127.0.0.1:${httpPort}/api/health`);
            if (res.ok) return true;
        } catch {}
        await new Promise((r) => setTimeout(r, 500));
    }
    return false;
}

// ---------- /db/sync deploy endpoint ----------

const fileHash = async (p: string) =>
    createHash("sha256").update(await Bun.file(p).text()).digest("hex");

const safeEqual = (a: string | null, b: string) => {
    if (!a) return false;
    return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
};

function startDeployEndpoint() {
    if (!process.env.DEPLOY_TOKEN) {
        console.log("DEPLOY_TOKEN not set — /db/sync endpoint disabled");
        return;
    }
    let deploying = false;
    Bun.serve({
        port: DEPLOY_PORT,
        async fetch(req) {
            const url = new URL(req.url);
            if (url.pathname !== "/db/sync") return new Response("not found", { status: 404 });
            if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
            if (!safeEqual(req.headers.get("x-deploy-token"), process.env.DEPLOY_TOKEN!)) {
                return new Response("unauthorized", { status: 401 });
            }
            if (deploying) return new Response("deploy already in progress", { status: 409 });
            deploying = true;
            try {
                const serverTsBefore = await fileHash(path.join(dir, "server.ts"));
                execSync("git pull --ff-only", { cwd: repo, stdio: "inherit" });
                execSync(
                    `mkdir -p pb_data_snapshots && tar -czf pb_data_snapshots/$(date +%Y%m%d-%H%M%S).tar.gz --exclude pb_data/backups -C pocketbase pb_data && ls -1t pb_data_snapshots/*.tar.gz | tail -n +${SNAPSHOT_KEEP + 1} | xargs -r rm`,
                    { cwd: repo, stdio: "inherit" },
                );
                await restartPB();
                const healthy = await waitForHealth(30_000);
                if (!healthy) {
                    return new Response("pocketbase did not become healthy after deploy", { status: 500 });
                }
                if ((await fileHash(path.join(dir, "server.ts"))) !== serverTsBefore) {
                    setTimeout(() => {
                        console.log("server.ts changed on deploy — exiting for the watchdog to start the new supervisor");
                        stopping = true;
                        child?.kill("SIGTERM");
                        process.exit(0);
                    }, 1000);
                    return new Response("deploy ok (supervisor restarting)", { status: 200 });
                }
                return new Response("deploy ok", { status: 200 });
            } catch (err) {
                console.error("deploy failed:", err);
                return new Response(`deploy failed: ${err}`, { status: 500 });
            } finally {
                deploying = false;
            }
        },
    });
    console.log(`deploy endpoint listening on :${DEPLOY_PORT}`);
}

await ensureBinary();
spawnPB();
startDeployEndpoint();
