/**
 * PocketBase supervisor + deploy endpoint.
 *
 *   bun run db    # dev:  127.0.0.1:8090 (PB_PORT changes the port; no
 *                 #       .env.prod in the repo)
 *   bun run db    # prod: binds PB_HTTP from .env.prod (e.g. 0.0.0.0:8090),
 *                 #       automigrate off, /db/sync armed by DEPLOY_TOKEN
 *
 * Downloads the pinned binary on first run, keeps `./pocketbase serve`
 * running, and serves the token-protected deploy endpoints on :9001:
 *
 *   POST /db/sync       git pull --ff-only -> stop PB -> pb_data snapshot ->
 *                       start PB -> respond only after /api/health passes
 *   POST /spa/publish   unpack a CI-built SPA tarball into build.next,
 *                       validate it, then swap it in as ../build (the served
 *                       publicDir) keeping the previous one as build.old
 *   POST /spa/rollback  swap ../build back to build.old
 *
 * In prod the same PB process serves the frontend from ../build
 * (`--publicDir`), so a SPA publish takes effect without a restart: PB reads
 * the directory on every request.
 *
 * Must stay inside pocketbase/: the binary resolves pb_migrations and
 * pb_hooks relative to the data dir (pocketbase/pb_data/../).
 *
 * NOTE: /db/sync restarts PocketBase only. If the pull changed server.ts
 * itself, the supervisor respawns ITSELF detached so the new version takes
 * over without downtime (there is no watchdog/cron to do it).
 */
import { spawn, type ChildProcess } from "node:child_process";
import {
    chmodSync,
    copyFileSync,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

const PB_VERSION = "0.40.6";
const isWindows = process.platform === "win32";
/** Release asset suffix, e.g. linux_amd64 / windows_amd64 / darwin_arm64. */
const platformTag = (() => {
    if (process.platform === "win32") return "windows_amd64";
    const arch = process.arch === "arm64" ? "arm64" : "amd64";
    if (process.platform === "darwin") return `darwin_${arch}`;
    return `linux_${arch}`;
})();
const binName = isWindows ? "pocketbase.exe" : "pocketbase";
const dir = import.meta.dir; // .../pocketbase
const bin = path.join(dir, binName);
const repo = path.resolve(dir, "..");
const DEPLOY_PORT = 9001;
const SNAPSHOT_KEEP = 5;
/** Cap for a SPA tarball upload (the real build is ~3 MB). */
const SPA_MAX_BYTES = 50 * 1024 * 1024;

// Prod config: when .env.prod (gitignored) exists at the repo root, load it
// (DEPLOY_TOKEN arms /db/sync, PB_HTTP sets the bind address) and switch to
// prod serve behavior. Without it, dev defaults apply.
const prodEnvPath = path.join(repo, ".env.prod");
let isProd = false;
if (existsSync(prodEnvPath)) {
    for (const line of (await Bun.file(prodEnvPath).text()).split("\n")) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (m && m[1] && m[2] && process.env[m[1]] === undefined)
            process.env[m[1]] = m[2];
    }
    isProd = true;
}

// Prod serves the CI-built SPA from ../build; the deploy-spa workflow
// publishes it (POST /spa/publish). Dev keeps Vite in charge of the UI.
// Both the flag and the path are absolute: PocketBase resolves a relative
// publicDir against its working directory (pocketbase/).
const publicDir = path.resolve(dir, process.env.PB_PUBLIC_DIR ?? "../build");
/** Staging/previous generations live next to the live bundle. */
const buildNext = `${publicDir}.next`;
const buildPrev = `${publicDir}.old`;
if (isProd && !existsSync(path.join(publicDir, "index.html"))) {
    console.log(
        `SPA not published yet — run the deploy-spa workflow to fill ${publicDir}`,
    );
}

/** Shared copy so a fresh worktree works even after the others are gone. */
function cachePath(): string {
    const base = process.env.XDG_CACHE_HOME ?? path.join(homedir(), ".cache");
    return path.join(
        base,
        "mimi-base",
        `pocketbase-${PB_VERSION}${isWindows ? ".exe" : ""}`,
    );
}

/**
 * New worktrees should not need GitHub. Look for the pinned binary in the
 * repo's registered worktrees, sibling checkouts, then the shared cache.
 */
function reusableBinaries(): string[] {
    const candidates: string[] = [];
    const parent = path.dirname(repo);

    try {
        const listing = execSync("git worktree list --porcelain", {
            cwd: repo,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        });
        for (const line of listing.split("\n")) {
            if (!line.startsWith("worktree ")) continue;
            const root = line.slice("worktree ".length).trim();
            candidates.push(path.join(root, "pocketbase", binName));
        }
    } catch {
        // Not a git checkout or git is missing; sibling scan still applies.
    }

    try {
        for (const entry of readdirSync(parent, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            candidates.push(
                path.join(parent, entry.name, "pocketbase", binName),
            );
        }
    } catch {
        // ignore
    }

    candidates.push(cachePath());

    return [...new Set(candidates)].filter(
        (candidate) => path.resolve(candidate) !== bin,
    );
}

/** Keep one shared copy so later worktrees don't depend on this checkout. */
function seedCache(source: string) {
    const target = cachePath();
    if (existsSync(target)) return;
    try {
        mkdirSync(path.dirname(target), { recursive: true });
        copyFileSync(source, target);
        chmodSync(target, 0o755);
    } catch {
        // The cache is an optimization only.
    }
}

function matchesPinnedVersion(candidate: string): boolean {
    try {
        const version = execFileSync(candidate, ["--version"], {
            encoding: "utf8",
        }).trim();
        return version.includes(PB_VERSION);
    } catch {
        return false;
    }
}

async function ensureBinary() {
    if (existsSync(bin)) {
        seedCache(bin);
        return;
    }

    for (const candidate of reusableBinaries()) {
        if (!existsSync(candidate)) continue;
        try {
            chmodSync(candidate, 0o755);
        } catch {
            // A read-only checkout is fine: we only read it.
        }
        if (!matchesPinnedVersion(candidate)) continue;
        try {
            copyFileSync(candidate, bin);
            chmodSync(bin, 0o755);
            seedCache(bin);
            console.log(`copied PocketBase v${PB_VERSION} from ${candidate}`);
            return;
        } catch (error) {
            console.warn(`could not reuse ${candidate}:`, error);
        }
    }

    const url = `https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_${platformTag}.zip`;
    console.log(`downloading PocketBase v${PB_VERSION} (${platformTag})...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
    const zip = path.join(dir, "pocketbase.zip");
    await Bun.write(zip, res);
    // Windows 10+ ships bsdtar, which reads zip archives; Linux uses unzip.
    execSync(isWindows ? "tar -xf pocketbase.zip" : "unzip -o pocketbase.zip", {
        cwd: dir,
        stdio: "inherit",
    });
    unlinkSync(zip);
    chmodSync(bin, 0o755);
    seedCache(bin);
}

const argv = process.argv.slice(2);
const devHttp = `127.0.0.1:${process.env.PB_PORT ?? "8090"}`;
const bindHttp = process.env.PB_HTTP ?? devHttp;
const serveArgs = [
    "serve",
    ...(argv.some((a) => a.startsWith("--http"))
        ? argv
        : ["--http", bindHttp, ...argv]),
    ...(isProd && !argv.some((a) => a.startsWith("--automigrate"))
        ? ["--automigrate=false"]
        : []),
    ...(isProd && !argv.some((a) => a.startsWith("--publicDir"))
        ? ["--publicDir", publicDir]
        : []),
];
const httpPort = (() => {
    const i = serveArgs.indexOf("--http");
    if (i === -1) return 8090;
    return Number(serveArgs[i + 1]?.split(":").pop()) || 8090;
})();

// `scripts/dev.ts` reads this to reuse a running instance instead of opening
// the same pb_data twice. Dev only: prod supervisors can respawn themselves.
const dataDirArg = serveArgs.indexOf("--dir");
const dataDir =
    dataDirArg === -1 ? path.join(dir, "pb_data") : serveArgs[dataDirArg + 1];
const lockFile = path.join(dataDir, ".dev-server.json");

function writeLock() {
    if (isProd) return;
    try {
        mkdirSync(dataDir, { recursive: true });
        writeFileSync(
            lockFile,
            JSON.stringify({ pid: process.pid, port: httpPort }),
        );
    } catch {
        // advisory only
    }
}

function removeLock() {
    if (isProd) return;
    try {
        const current = JSON.parse(readFileSync(lockFile, "utf8")) as {
            pid?: number;
        };
        if (current.pid !== process.pid) return;
        unlinkSync(lockFile);
    } catch {
        // already gone / not ours
    }
}

// Dev WSL often exports an HTTP proxy that cannot reach opencode.ai; the AI
// relay hook uses $http.send and would otherwise fail. Prod keeps the
// server's network config untouched.
const pbEnv = { ...process.env };
if (!isProd) {
    // Arms pb_hooks/dev_seed.pb.js (local test account only).
    pbEnv.MIMI_DEV = "1";
    const bypass = [pbEnv.NO_PROXY, pbEnv.no_proxy, "opencode.ai"]
        .filter(Boolean)
        .join(",");
    pbEnv.NO_PROXY = bypass;
    pbEnv.no_proxy = bypass;
} else {
    // Never seed the known-password dev account in prod, even if the
    // surrounding shell exported MIMI_DEV by accident.
    delete pbEnv.MIMI_DEV;
}

let child: ChildProcess | null = null;
let stopping = false;
let manualRestart = false;

const onSignal = () => {
    stopping = true;
    removeLock();
    child?.kill("SIGTERM");
    process.exit(0);
};
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);
process.on("exit", removeLock);

function spawnPB() {
    console.log(`starting: pocketbase ${serveArgs.join(" ")}`);
    child = spawn(bin, serveArgs, {
        cwd: dir,
        stdio: "inherit",
        env: pbEnv,
    });
    child.on("exit", (code, signal) => {
        if (stopping || manualRestart) return;
        console.error(
            `pocketbase exited (code=${code} signal=${signal}), restarting in 2s`,
        );
        setTimeout(spawnPB, 2000);
    });
}

/**
 * Kill the current PB and spawn a fresh one from disk; resolves when the new
 * child is up. `whileStopped` runs after PB has exited and before the new
 * process starts, so callers can touch pb_data without racing SQLite.
 */
function restartPB(whileStopped?: () => void): Promise<void> {
    return new Promise((resolve) => {
        const start = () => {
            try {
                whileStopped?.();
            } catch (err) {
                // The deploy must still bring PocketBase back up.
                console.error("pre-restart step failed:", err);
            }
            spawnPB();
            resolve();
        };
        if (!child) return start();
        const dying = child;
        manualRestart = true;
        dying.on("exit", () => {
            manualRestart = false;
            start();
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

// ---------- pb_data snapshots ----------

const SNAPSHOT_DIR = path.join(repo, "pb_data_snapshots");
const SNAPSHOT_RE = /^\d{8}-\d{6}\.tar\.gz$/;

function snapshotName(date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
        `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
        `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    );
}

/**
 * Archive pb_data into pb_data_snapshots/. Only safe while PocketBase is
 * stopped (see restartPB's `whileStopped`): tarring a live dataset fails with
 * "file changed as we read it" and stores an inconsistent copy. The archive is
 * written as .partial and renamed on success, so pruning never keeps a
 * half-written file.
 */
function snapshotData(): string {
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
    const target = path.join(SNAPSHOT_DIR, `${snapshotName()}.tar.gz`);
    const partial = `${target}.partial`;
    try {
        execFileSync(
            "tar",
            [
                "-czf",
                partial,
                "--exclude",
                "pb_data/backups",
                "-C",
                path.join(repo, "pocketbase"),
                "pb_data",
            ],
            { stdio: "inherit" },
        );
        renameSync(partial, target);
    } finally {
        rmSync(partial, { force: true });
    }
    pruneSnapshots();
    return target;
}

/** Keep the newest SNAPSHOT_KEEP archives, ignoring .partial leftovers. */
function pruneSnapshots() {
    const files = readdirSync(SNAPSHOT_DIR)
        .filter((name) => SNAPSHOT_RE.test(name))
        .sort()
        .reverse();
    for (const name of files.slice(SNAPSHOT_KEEP)) {
        rmSync(path.join(SNAPSHOT_DIR, name), { force: true });
    }
}

// ---------- /db/sync deploy endpoint ----------

const fileHash = async (p: string) =>
    createHash("sha256")
        .update(await Bun.file(p).text())
        .digest("hex");

const safeEqual = (a: string | null, b: string) => {
    if (!a) return false;
    return timingSafeEqual(
        createHash("sha256").update(a).digest(),
        createHash("sha256").update(b).digest(),
    );
};

// ---------- /spa publish endpoints ----------

/**
 * Unpack the uploaded tarball into build.next, verify it, then swap it in as
 * build/, keeping the previous generation as build.old. Any failure leaves the
 * live build/ untouched; PocketBase reads publicDir per request, so no restart
 * is involved.
 */
async function publishSpa(req: Request, sha: string): Promise<Response> {
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > SPA_MAX_BYTES)
        return new Response("payload too large", { status: 413 });

    const body = new Uint8Array(await req.arrayBuffer());
    if (body.byteLength > SPA_MAX_BYTES)
        return new Response("payload too large", { status: 413 });
    if (body.byteLength === 0)
        return new Response("empty body", { status: 400 });

    const upload = path.join(repo, "tmp", "spa-upload.tar.gz");
    mkdirSync(path.dirname(upload), { recursive: true });
    rmSync(buildNext, { recursive: true, force: true });
    mkdirSync(buildNext, { recursive: true });
    try {
        writeFileSync(upload, body);
        execFileSync("tar", ["-xzf", upload, "-C", buildNext], {
            stdio: "inherit",
        });
        if (!existsSync(path.join(buildNext, "index.html")))
            throw new Error("tarball has no index.html at its root");
        rmSync(buildPrev, { recursive: true, force: true });
        if (existsSync(publicDir)) renameSync(publicDir, buildPrev);
        renameSync(buildNext, publicDir);
        console.log(`spa published: ${sha} (${body.byteLength} bytes)`);
        return new Response(`ok ${sha} ${body.byteLength}\n`);
    } catch (err) {
        rmSync(buildNext, { recursive: true, force: true });
        console.error("spa publish failed:", err);
        return new Response(`spa publish failed: ${err}`, { status: 500 });
    } finally {
        rmSync(upload, { force: true });
    }
}

/** Swap the live bundle back to the previous one; calling it twice toggles. */
function rollbackSpa(): Response {
    if (!existsSync(path.join(buildPrev, "index.html")))
        return new Response("no previous build", { status: 409 });
    rmSync(buildNext, { recursive: true, force: true });
    if (existsSync(publicDir)) renameSync(publicDir, buildNext);
    renameSync(buildPrev, publicDir);
    if (existsSync(buildNext)) renameSync(buildNext, buildPrev);
    console.log("spa rolled back");
    return new Response("rolled back\n");
}

function startDeployEndpoint() {
    if (!process.env.DEPLOY_TOKEN) {
        console.log("DEPLOY_TOKEN not set — /db/sync and /spa/* disabled");
        return;
    }
    let deploying = false;
    let publishing = false;
    const deployBind = process.env.DEPLOY_BIND;
    Bun.serve({
        port: DEPLOY_PORT,
        ...(deployBind ? { hostname: deployBind } : {}),
        async fetch(req) {
            const url = new URL(req.url);
            const isSpa =
                url.pathname === "/spa/publish" ||
                url.pathname === "/spa/rollback";
            if (url.pathname !== "/db/sync" && !isSpa)
                return new Response("not found", { status: 404 });
            if (req.method !== "POST")
                return new Response("method not allowed", { status: 405 });
            if (
                !safeEqual(
                    req.headers.get("x-deploy-token"),
                    process.env.DEPLOY_TOKEN!,
                )
            ) {
                return new Response("unauthorized", { status: 401 });
            }
            if (isSpa) {
                if (publishing)
                    return new Response("publish already in progress", {
                        status: 409,
                    });
                publishing = true;
                try {
                    return url.pathname === "/spa/publish"
                        ? await publishSpa(
                              req,
                              req.headers.get("x-spa-sha") ?? "unknown",
                          )
                        : rollbackSpa();
                } finally {
                    publishing = false;
                }
            }
            if (deploying)
                return new Response("deploy already in progress", {
                    status: 409,
                });
            deploying = true;
            try {
                const serverTsBefore = await fileHash(
                    path.join(dir, "server.ts"),
                );
                execSync("git pull --ff-only", { cwd: repo, stdio: "inherit" });
                // Snapshot while PB is down: a live tar can hit "file changed
                // as we read it" (SQLite WAL), which used to fail the deploy.
                let snapshotError: unknown = null;
                await restartPB(() => {
                    try {
                        const file = snapshotData();
                        console.log(`pb_data snapshot: ${path.basename(file)}`);
                    } catch (err) {
                        snapshotError = err;
                        console.error("pb_data snapshot failed:", err);
                    }
                });
                const healthy = await waitForHealth(30_000);
                if (!healthy) {
                    return new Response(
                        "pocketbase did not become healthy after deploy",
                        { status: 500 },
                    );
                }
                if (snapshotError) {
                    return new Response(
                        `deploy ok, but the pb_data snapshot failed: ${snapshotError}`,
                        { status: 500 },
                    );
                }
                if (
                    (await fileHash(path.join(dir, "server.ts"))) !==
                    serverTsBefore
                ) {
                    setTimeout(async () => {
                        console.log(
                            "server.ts changed on deploy — respawning supervisor",
                        );
                        stopping = true;
                        child?.kill("SIGTERM");
                        await new Promise((r) => setTimeout(r, 1500));
                        const logFd = openSync(
                            path.join(repo, "mimi-db.log"),
                            "a",
                        );
                        spawn(process.execPath, [Bun.main], {
                            cwd: repo,
                            env: process.env,
                            detached: true,
                            stdio: ["ignore", logFd, logFd],
                        }).unref();
                        process.exit(0);
                    }, 1000);
                    return new Response("deploy ok (supervisor restarting)", {
                        status: 200,
                    });
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
    console.log(
        `deploy endpoint listening on ${deployBind ?? "0.0.0.0"}:${DEPLOY_PORT}`,
    );
}

await ensureBinary();
writeLock();
spawnPB();
startDeployEndpoint();
