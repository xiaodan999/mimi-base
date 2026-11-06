/**
 * PocketBase supervisor + deploy endpoint.
 *
 *   bun run db    # dev:  127.0.0.1:8090 (PB_PORT changes the port; no
 *                 #       .env.prod in the repo)
 *   bun run db    # prod: binds PB_HTTP from .env.prod (e.g. 0.0.0.0:8090),
 *                 #       automigrate off, deploy endpoints armed by secrets
 *
 * Downloads the pinned binary on first run, keeps `./pocketbase serve`
 * running, and serves the authenticated deploy endpoints on :9001
 * (bound to 127.0.0.1 unless DEPLOY_BIND is explicitly opted into the public
 * interface with DEPLOY_BIND_ALLOW_PUBLIC=1):
 *
 *   POST /db/sync       git pull --ff-only -> stop PB -> pb_data snapshot ->
 *                       start PB -> respond only after /api/health passes.
 *                       A failed snapshot ABORTS the restart (PB stays down,
 *                       migrations never run without a verified backup).
 *   POST /repo/sync     git pull --ff-only ONLY (no PB stop/restart). Used by
 *                       the SPA deploy to keep the on-disk checkout current;
 *                       it does NOT update any running server code.
 *   POST /spa/publish   hash-verify + member-validate a CI-built tarball,
 *                       extract into a generation, then atomically flip the
 *                       `build` symlink in a single rename.
 *   POST /spa/rollback  flip the `build` symlink back to the previous gen.
 *
 * Auth: a single shared DEPLOY_TOKEN, sent as x-deploy-token and/or used as the
 * key for an optional timestamped HMAC (x-deploy-ts + x-deploy-signature).
 * /spa/publish additionally verifies the tarball sha256 (x-spa-sha256) before
 * writing or extracting it.
 *
 * `build` is a symlink to one of the generations in `build.next/gen-*`, so a
 * publish is a single atomic rename and PocketBase (which reopens publicDir
 * per request) always has a valid bundle to serve.
 *
 * Must stay inside pocketbase/: the binary resolves pb_migrations and
 * pb_hooks relative to the data dir (pocketbase/pb_data/../).
 *
 * NOTE: /db/sync restarts PocketBase only. If the pull changed server.ts
 * itself, the supervisor respawns ITSELF detached, but only AFTER verifying the
 * new supervisor (and its PB) are healthy. The supervisor is started detached
 * by scripts/server-setup.sh; nothing restarts it on its own.
 */
import { spawn, type ChildProcess } from "node:child_process";
import {
    chmodSync,
    copyFileSync,
    existsSync,
    lstatSync,
    mkdirSync,
    openSync,
    readFileSync,
    readdirSync,
    readlinkSync,
    renameSync,
    rmSync,
    statSync,
    symlinkSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
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
/** A real pb_data archive is far larger; reject empty/truncated archives. */
const SNAPSHOT_MIN_BYTES = 1024;
/** Cap for a SPA tarball upload (the real build is ~3 MB). */
const SPA_MAX_BYTES = 50 * 1024 * 1024;
/** Cap for the extracted bundle and its member count (tar-bomb guard). */
const SPA_MAX_EXTRACTED = 200 * 1024 * 1024;
const SPA_MAX_MEMBERS = 10_000;
/** Generations of the SPA bundle to keep (active + N-1 for rollback). */
const BUILD_KEEP = 3;
/** Max clock skew / replay window for a timestamped HMAC signature. */
const DEPLOY_SIG_TOLERANCE_SEC = 300;

const DEPLOY_PATHS: string[] = [
    "/db/sync",
    "/spa/publish",
    "/spa/rollback",
    "/repo/sync",
];

// ---------- prod config ----------

// `.env.prod` (gitignored) exists at the repo root in prod: load it and switch
// to prod serve behavior. Mirror scripts/dev.ts: strip surrounding quotes and
// inline comments, and ignore blank/comment-only lines.
const prodEnvPath = path.join(repo, ".env.prod");
let isProd = false;

function parseEnvFile(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
        if (!m || !m[1]) continue;
        let value = m[2] ?? "";
        const quote = value[0];
        if (quote === '"' || quote === "'") {
            const end = value.indexOf(quote, 1);
            value = end === -1 ? value.slice(1) : value.slice(1, end);
        } else {
            const hash = value.indexOf("#");
            if (hash !== -1) value = value.slice(0, hash);
            value = value.trim();
        }
        out[m[1]] = value;
    }
    return out;
}

if (existsSync(prodEnvPath)) {
    for (const [key, value] of Object.entries(
        parseEnvFile(await Bun.file(prodEnvPath).text()),
    )) {
        if (process.env[key] === undefined) process.env[key] = value;
    }
    isProd = true;
}

// Deploy endpoints bind to loopback by default. A non-loopback bind needs an
// explicit DEPLOY_BIND_ALLOW_PUBLIC=1 opt-in; otherwise we force loopback.
const DEPLOY_LOOPBACK = new Set([
    "127.0.0.1",
    "localhost",
    "::1",
    "[::1]",
    "0:0:0:0:0:0:0:1",
]);
const requestedBind = process.env.DEPLOY_BIND ?? "127.0.0.1";
let deployBind = requestedBind;
if (!DEPLOY_LOOPBACK.has(requestedBind)) {
    if (process.env.DEPLOY_BIND_ALLOW_PUBLIC === "1") {
        console.warn(
            `DEPLOY_BIND=${requestedBind} is non-loopback (explicit opt-in): deploy endpoint exposed`,
        );
    } else {
        console.warn(
            `DEPLOY_BIND=${requestedBind} is non-loopback but DEPLOY_BIND_ALLOW_PUBLIC!=1; forcing 127.0.0.1`,
        );
        deployBind = "127.0.0.1";
    }
}

// Prod serves the CI-built SPA from ../build; the deploy-spa workflow
// publishes it (POST /spa/publish). Dev keeps Vite in charge of the UI.
// Both the flag and the path are absolute: PocketBase resolves a relative
// publicDir against its working directory (pocketbase/).
const publicDir = path.resolve(dir, process.env.PB_PUBLIC_DIR ?? "../build");
/** Generations live inside build.next/ (already gitignored). */
const gensDir = `${publicDir}.next`;
const legacyPrev = `${publicDir}.old`;
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
// the same pb_data twice. In prod it doubles as a single-instance lock.
const dataDirArg = serveArgs.indexOf("--dir");
const dataDir =
    dataDirArg === -1 ? path.join(dir, "pb_data") : serveArgs[dataDirArg + 1];
const lockFile = path.join(dataDir, ".dev-server.json");

function writeLock() {
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

/** Is a live process still holding the prod lock? */
function lockOwnerAlive(): boolean {
    try {
        const { pid } = JSON.parse(readFileSync(lockFile, "utf8")) as {
            pid?: number;
        };
        if (!pid) return false;
        process.kill(pid, 0); // throws ESRCH when the owner is gone
        return true;
    } catch {
        return false;
    }
}

// Build a MINIMAL env for the PocketBase child: never forward deploy secrets
// or the whole parent environment. Dev also arms the local seed account and
// bypasses the (often WSL-hostile) HTTP proxy for opencode.ai.
const PB_ENV_ALLOW = [
    "PATH",
    "HOME",
    "TZ",
    "LANG",
    "LC_ALL",
    "XDG_CACHE_HOME",
    "TMPDIR",
    "NO_PROXY",
    "no_proxy",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "http_proxy",
    "https_proxy",
];
function buildPbEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const key of PB_ENV_ALLOW) {
        const value = process.env[key];
        if (value !== undefined) env[key] = value;
    }
    if (!isProd) {
        env.MIMI_DEV = "1";
        const bypass = [env.NO_PROXY, env.no_proxy, "opencode.ai"]
            .filter(Boolean)
            .join(",");
        env.NO_PROXY = bypass;
        env.no_proxy = bypass;
    }
    return env;
}
const pbEnv = buildPbEnv();

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
 *
 * If `whileStopped` throws (e.g. the snapshot failed), the Promise REJECTS and
 * PB is NOT restarted: starting PB is exactly when pulled migrations apply, so
 * running them without a verified backup would be unsafe (#13). The deploy
 * returns 500 and an operator restores the last snapshot before retrying.
 */
function restartPB(whileStopped?: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const start = () => {
            try {
                whileStopped?.();
            } catch (err) {
                console.error(
                    "pre-restart step failed — NOT starting PocketBase:",
                    err,
                );
                manualRestart = false;
                child = null;
                reject(err);
                return;
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

// ---------- health checks ----------

async function healthOnce(): Promise<boolean> {
    try {
        const res = await fetch(`http://127.0.0.1:${httpPort}/api/health`, {
            signal: AbortSignal.timeout(1000),
        });
        return res.ok;
    } catch {
        return false;
    }
}

async function waitForHealth(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await healthOnce()) return true;
        await new Promise((r) => setTimeout(r, 500));
    }
    return false;
}

async function waitForHealthDown(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (!(await healthOnce())) return;
        await new Promise((r) => setTimeout(r, 300));
    }
}

/** The new supervisor is healthy when it is alive AND its PB serves /api/health. */
async function waitForNewSupervisor(
    proc: ChildProcess,
    timeoutMs: number,
): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (proc.exitCode !== null || proc.signalCode !== null) return false;
        if (await healthOnce()) return true;
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
 * A snapshot is valid only if it is a readable gzip tar, has a sane size, and
 * contains `pb_data/data.db`. Used before renaming a new archive into place and
 * again while pruning, so empty/corrupt archives never count toward
 * SNAPSHOT_KEEP (#13).
 */
function validateSnapshot(file: string): void {
    const size = statSync(file).size;
    if (size < SNAPSHOT_MIN_BYTES)
        throw new Error(`snapshot too small: ${size} bytes`);
    const listing = execFileSync("tar", ["-tzf", file], {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
    });
    const hasDb = listing
        .split("\n")
        .some((line) => line.replace(/^\.\//, "").trim() === "pb_data/data.db");
    if (!hasDb) throw new Error("snapshot is missing pb_data/data.db");
}

/**
 * Archive pb_data into pb_data_snapshots/. Only safe while PocketBase is
 * stopped (see restartPB's `whileStopped`): tarring a live dataset fails with
 * "file changed as we read it" and stores an inconsistent copy. The archive is
 * written as .partial, validated, then renamed on success.
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
        validateSnapshot(partial);
        renameSync(partial, target);
    } finally {
        rmSync(partial, { force: true });
    }
    pruneSnapshots();
    return target;
}

/** Keep the newest SNAPSHOT_KEEP *validated* archives; drop invalid ones. */
function pruneSnapshots() {
    const files = readdirSync(SNAPSHOT_DIR)
        .filter((name) => SNAPSHOT_RE.test(name))
        .sort()
        .reverse();
    let kept = 0;
    for (const name of files) {
        const file = path.join(SNAPSHOT_DIR, name);
        try {
            validateSnapshot(file);
        } catch (err) {
            console.warn(`dropping invalid snapshot ${name}:`, err);
            rmSync(file, { force: true });
            continue;
        }
        kept++;
        if (kept > SNAPSHOT_KEEP) rmSync(file, { force: true });
    }
}

// ---------- deploy auth ----------

const fileHash = async (p: string) =>
    createHash("sha256")
        .update(await Bun.file(p).text())
        .digest("hex");

const sha256Hex = (data: Uint8Array | string) =>
    createHash("sha256").update(data).digest("hex");

const safeEqualHex = (a: string | null, b: string): boolean => {
    if (!a) return false;
    return timingSafeEqual(
        createHash("sha256").update(a.trim().toLowerCase()).digest(),
        createHash("sha256").update(b.toLowerCase()).digest(),
    );
};

/**
 * The deploy secret, shared by every endpoint. An empty value disables the
 * deploy server entirely. Dependents send it as x-deploy-token and use it as
 * the HMAC key for x-deploy-signature.
 */
function deployToken(): string {
    return process.env.DEPLOY_TOKEN ?? "";
}

/**
 * Accept either a fresh timestamped HMAC (x-deploy-signature over
 * "<pathname>.<ts>") or the static bearer (x-deploy-token).
 */
function authorize(req: Request, pathname: string): boolean {
    const secret = deployToken();
    if (!secret) return false;
    const bearer = req.headers.get("x-deploy-token");
    const ts = req.headers.get("x-deploy-ts");
    const sig = req.headers.get("x-deploy-signature");
    if (ts && sig) {
        const now = Math.floor(Date.now() / 1000);
        const parsed = Number(ts);
        const fresh =
            Number.isFinite(parsed) &&
            Math.abs(now - parsed) <= DEPLOY_SIG_TOLERANCE_SEC;
        const message = `${pathname}.${ts}`;
        if (
            fresh &&
            safeEqualHex(
                sig,
                createHmac("sha256", secret).update(message).digest("hex"),
            )
        )
            return true;
    }
    return !!bearer && safeEqualHex(bearer, secret);
}

// ---------- SPA generations + atomic swap ----------

function isSymlink(p: string): boolean {
    try {
        return lstatSync(p).isSymbolicLink();
    } catch {
        return false;
    }
}

function currentGen(): string | null {
    try {
        const target = readlinkSync(publicDir);
        return path.isAbsolute(target)
            ? target
            : path.resolve(path.dirname(publicDir), target);
    } catch {
        return null;
    }
}

function listGenerations(): string[] {
    try {
        return readdirSync(gensDir, { withFileTypes: true })
            .filter((e) => e.isDirectory() && e.name.startsWith("gen-"))
            .map((e) => e.name)
            .sort()
            .reverse();
    } catch {
        return [];
    }
}

/** One-time migration from the old "build/ is a real dir" layout. */
function ensureGenerationLayout(): void {
    mkdirSync(gensDir, { recursive: true });
    // The old two-rename swap left build.old/ behind; it is no longer used.
    rmSync(legacyPrev, { recursive: true, force: true });
    if (isSymlink(publicDir)) return;
    if (existsSync(publicDir)) {
        const gen = path.join(gensDir, `gen-${snapshotName()}-legacy`);
        rmSync(gen, { recursive: true, force: true });
        renameSync(publicDir, gen);
        symlinkSync(gen, publicDir, "dir");
        console.log(`migrated legacy build/ -> ${path.basename(gen)}`);
    }
}

/** Single atomic rename replaces the `build` symlink with a new generation. */
function atomicSwapTo(genDir: string): void {
    const tmpLink = path.join(gensDir, `.swap-${process.pid}`);
    rmSync(tmpLink, { recursive: true, force: true });
    symlinkSync(genDir, tmpLink, "dir");
    renameSync(tmpLink, publicDir);
}

/** Keep the active generation plus the newest BUILD_KEEP-1 for rollback. */
function pruneGenerations(): void {
    const active = currentGen();
    const gens = listGenerations();
    const keep = new Set<string>();
    if (active) keep.add(path.basename(active));
    for (const name of gens) {
        if (keep.size >= BUILD_KEEP) break;
        keep.add(name);
    }
    for (const name of gens) {
        if (!keep.has(name))
            rmSync(path.join(gensDir, name), { recursive: true, force: true });
    }
}

// ---------- SPA tarball validation ----------

/** Validate every tar entry before extracting (no absolute paths/../links/devices). */
function validateTar(archive: string): void {
    const opts = { encoding: "utf8" as const, maxBuffer: 32 * 1024 * 1024 };
    const names = execFileSync("tar", ["-tzf", archive], opts)
        .split("\n")
        .filter((line) => line.length > 0);
    const verbose = execFileSync("tar", ["-tvzf", archive], opts)
        .split("\n")
        .filter((line) => line.length > 0);
    if (names.length !== verbose.length)
        throw new Error("tar listing mismatch");
    if (names.length > SPA_MAX_MEMBERS)
        throw new Error(`too many tar members: ${names.length}`);
    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const type = verbose[i][0];
        if (type !== "-" && type !== "d")
            throw new Error(`disallowed tar member (type '${type}'): ${name}`);
        const clean = name.replace(/^\.\//, "");
        if (name.startsWith("/") || clean.startsWith("/"))
            throw new Error(`absolute path in tar: ${name}`);
        if (clean.split("/").includes(".."))
            throw new Error(`parent traversal in tar: ${name}`);
    }
}

/** Post-extraction belt-and-suspenders: no symlinks, cap total extracted size. */
function validateExtractedTree(root: string): void {
    let total = 0;
    const walk = (current: string) => {
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            const st = lstatSync(full); // do not follow symlinks
            if (st.isSymbolicLink())
                throw new Error(`symlink in extracted bundle: ${full}`);
            if (st.isDirectory()) {
                walk(full);
                continue;
            }
            if (!st.isFile())
                throw new Error(
                    `non-regular file in extracted bundle: ${full}`,
                );
            total += st.size;
            if (total > SPA_MAX_EXTRACTED)
                throw new Error("extracted bundle exceeds size cap");
        }
    };
    walk(root);
}

// ---------- /spa publish endpoints ----------

/**
 * Verify the tarball sha256, validate and extract it into a new generation,
 * then flip the `build` symlink in one atomic rename. Any failure leaves the
 * live bundle untouched. PocketBase reopens publicDir per request, so no
 * restart is involved.
 */
async function publishSpa(
    req: Request,
    body: Uint8Array,
    sha: string,
): Promise<Response> {
    const declaredSha = req.headers.get("x-spa-sha256");
    if (!declaredSha)
        return new Response("missing x-spa-sha256", { status: 400 });
    if (!safeEqualHex(declaredSha, sha256Hex(body)))
        return new Response("tarball sha256 mismatch", { status: 400 });

    ensureGenerationLayout();
    const short = sha.replace(/[^0-9a-fA-F]/g, "").slice(0, 12) || "unknown";
    const genDir = path.join(gensDir, `gen-${snapshotName()}-${short}`);
    const upload = path.join(repo, "tmp", "spa-upload.tar.gz");
    try {
        rmSync(genDir, { recursive: true, force: true });
        mkdirSync(genDir, { recursive: true });
        mkdirSync(path.dirname(upload), { recursive: true });
        writeFileSync(upload, body);
        validateTar(upload);
        execFileSync(
            "tar",
            [
                "-xzf",
                upload,
                "-C",
                genDir,
                "--no-same-owner",
                "--no-same-permissions",
            ],
            { stdio: "inherit" },
        );
        validateExtractedTree(genDir);
        if (!existsSync(path.join(genDir, "index.html")))
            throw new Error("tarball has no index.html at its root");
        // Tie the bundle to the commit the deploy claims to publish.
        const versionFile = path.join(genDir, "version.json");
        if (existsSync(versionFile)) {
            const built = JSON.parse(readFileSync(versionFile, "utf8")) as {
                sha?: string;
            };
            if (built.sha && /^[0-9a-f]{40}$/.test(sha) && built.sha !== sha)
                throw new Error(
                    `version.json sha ${built.sha} != x-spa-sha ${sha}`,
                );
        }
        atomicSwapTo(genDir);
        pruneGenerations();
        console.log(
            `spa published: ${sha} (${body.byteLength} bytes, ${short})`,
        );
        return new Response(`ok ${sha} ${body.byteLength}\n`);
    } catch (err) {
        rmSync(genDir, { recursive: true, force: true });
        console.error("spa publish failed:", err);
        return new Response(`spa publish failed: ${err}`, { status: 500 });
    } finally {
        rmSync(upload, { force: true });
    }
}

/** Flip the live bundle back to the previous generation (toggles on repeat). */
function rollbackSpa(): Response {
    ensureGenerationLayout();
    const active = currentGen();
    const prev = listGenerations().find(
        (name) => path.join(gensDir, name) !== active,
    );
    if (!prev) return new Response("no previous build", { status: 409 });
    atomicSwapTo(path.join(gensDir, prev));
    console.log(`spa rolled back to ${prev}`);
    return new Response(`rolled back to ${prev}\n`);
}

// ---------- /repo/sync (pull only) ----------

/**
 * Keep the VPS checkout at the deployed commit WITHOUT stopping PB. This does
 * NOT reload running server code / migrations — those are /db/sync's job. The
 * response contains HEAD so CI can assert it equals the deployed sha (#12).
 */
function repoSync(): Response {
    try {
        execSync("git pull --ff-only", { cwd: repo, stdio: "inherit" });
        const head = execSync("git rev-parse HEAD", {
            cwd: repo,
            encoding: "utf8",
        }).trim();
        console.log(`repo synced (pull only) at ${head}`);
        return new Response(`repo synced at ${head}\n`);
    } catch (err) {
        console.error("repo sync failed:", err);
        return new Response(`repo sync failed: ${err}`, { status: 500 });
    }
}

// ---------- /db/sync ----------

/**
 * Verify the NEW supervisor is healthy before the old one exits, then release
 * the lock so the replacement can own :9001 (its deploy endpoint retries the
 * briefly-busy port). If the replacement is unhealthy, keep serving and restore
 * our own PB child (#15).
 */
function scheduleRespawn(): void {
    setTimeout(async () => {
        console.log("server.ts changed on deploy — respawning supervisor");
        const prevChild = child;
        manualRestart = true;
        stopping = true;
        prevChild?.kill("SIGTERM");
        await waitForHealthDown(8000);

        const logFd = openSync(path.join(repo, "mimi-db.log"), "a");
        const next = spawn(process.execPath, [Bun.main], {
            cwd: repo,
            // Minimal env + a marker so the child bypasses our single-instance
            // lock. It re-reads .env.prod itself for the deploy secrets.
            env: { ...pbEnv, MIMI_RESPAWN_CHILD: "1" },
            detached: true,
            stdio: ["ignore", logFd, logFd],
        });
        next.unref();

        const healthy = await waitForNewSupervisor(next, 30_000);
        if (!healthy) {
            console.error(
                "new supervisor did NOT become healthy — keeping the old one; killing failed child",
            );
            try {
                // `next` is a detached group leader: kill the whole group so
                // its orphaned PocketBase child cannot keep holding :8090 and
                // collide with the old supervisor's PB below.
                if (next.pid) process.kill(-next.pid, "SIGTERM");
                else next.kill("SIGTERM");
            } catch {
                // already gone
            }
            stopping = false;
            manualRestart = false;
            child = null;
            spawnPB();
            return;
        }
        removeLock();
        process.exit(0);
    }, 1000);
}

async function dbSync(): Promise<Response> {
    const serverTsBefore = await fileHash(path.join(dir, "server.ts"));
    try {
        execSync("git pull --ff-only", { cwd: repo, stdio: "inherit" });
        // If snapshotData() throws, restartPB rejects WITHOUT starting PB, so
        // migrations never apply without a verified backup (#13).
        await restartPB(() => {
            const file = snapshotData();
            console.log(`pb_data snapshot: ${path.basename(file)}`);
        });
        const healthy = await waitForHealth(30_000);
        if (!healthy)
            return new Response(
                "pocketbase did not become healthy after deploy",
                { status: 500 },
            );
        if ((await fileHash(path.join(dir, "server.ts"))) !== serverTsBefore) {
            scheduleRespawn();
            return new Response("deploy ok (supervisor restarting)", {
                status: 200,
            });
        }
        return new Response("deploy ok", { status: 200 });
    } catch (err) {
        console.error("deploy failed:", err);
        return new Response(
            `deploy failed: ${err}. PocketBase was NOT restarted; restore the last verified pb_data snapshot before retrying.`,
            { status: 500 },
        );
    }
}

// ---------- deploy HTTP server ----------

function startDeployEndpoint() {
    if (!deployToken()) {
        console.log("no DEPLOY_TOKEN set — deploy endpoints disabled");
        return;
    }
    let deploying = false;
    let publishing = false;

    const serve = () =>
        Bun.serve({
            port: DEPLOY_PORT,
            hostname: deployBind,
            async fetch(req) {
                const url = new URL(req.url);
                const pathname = url.pathname;
                if (!DEPLOY_PATHS.includes(pathname))
                    return new Response("not found", { status: 404 });
                if (req.method !== "POST")
                    return new Response("method not allowed", { status: 405 });
                if (!authorize(req, pathname))
                    return new Response("unauthorized", { status: 401 });

                if (
                    pathname === "/spa/publish" ||
                    pathname === "/spa/rollback"
                ) {
                    if (publishing)
                        return new Response("publish already in progress", {
                            status: 409,
                        });
                    publishing = true;
                    try {
                        if (pathname === "/spa/rollback") return rollbackSpa();
                        const declared = Number(
                            req.headers.get("content-length") ?? 0,
                        );
                        if (declared > SPA_MAX_BYTES)
                            return new Response("payload too large", {
                                status: 413,
                            });
                        const body = new Uint8Array(await req.arrayBuffer());
                        if (body.byteLength > SPA_MAX_BYTES)
                            return new Response("payload too large", {
                                status: 413,
                            });
                        if (body.byteLength === 0)
                            return new Response("empty body", { status: 400 });
                        return await publishSpa(
                            req,
                            body,
                            req.headers.get("x-spa-sha") ?? "unknown",
                        );
                    } finally {
                        publishing = false;
                    }
                }

                if (pathname === "/repo/sync") return repoSync();

                if (deploying)
                    return new Response("deploy already in progress", {
                        status: 409,
                    });
                deploying = true;
                try {
                    return await dbSync();
                } finally {
                    deploying = false;
                }
            },
        });

    // Retry binding briefly: during a health-verified respawn the old process
    // still owns :9001 for a moment until it exits.
    let tries = 0;
    const bind = () => {
        try {
            serve();
            console.log(
                `deploy endpoint listening on ${deployBind}:${DEPLOY_PORT}`,
            );
        } catch (err) {
            if (++tries <= 20) {
                console.warn(`deploy port busy, retry ${tries}/20...`);
                setTimeout(bind, 500);
            } else {
                console.error("could not bind deploy endpoint:", err);
            }
        }
    };
    bind();
}

// ---------- startup ----------

await ensureBinary();
if (isProd) {
    ensureGenerationLayout();
    // Prod single-instance lock (#15): refuse to start if a live supervisor
    // already owns the data dir. The respawned replacement is exempt.
    if (
        process.env.MIMI_RESPAWN_CHILD !== "1" &&
        existsSync(lockFile) &&
        lockOwnerAlive()
    ) {
        console.error(
            `another supervisor is already running (${lockFile}); exiting`,
        );
        process.exit(1);
    }
}
writeLock();
spawnPB();
startDeployEndpoint();
