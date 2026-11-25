/**
 * `bun run dev:all` — the local backend stack (PocketBase + Bun API) plus Vite,
 * always reachable from the LAN.
 *
 * Vite listens on 0.0.0.0 and the printed URL is reachable from the LAN. The
 * API and PocketBase stay on loopback; Vite proxies `/api` and `/db`, so the
 * client uses same-origin.
 *
 * Each worktree keeps its own `pocketbase/pb_data/`. Busy ports are skipped,
 * and a healthy stack already running for this checkout is reused.
 */

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { networkInterfaces } from "node:os";
import path from "node:path";

import { type BackendsLock, readBackendsLock } from "./backends";

const repo = path.resolve(import.meta.dir, "..");
process.chdir(repo);

const isWindows = process.platform === "win32";

const log = (message: string) => console.log(`[dev:all] ${message}`);

function fail(message: string): never {
    console.error(`[dev:all] error: ${message}`);
    process.exit(1);
}

function fileEnv(): Record<string, string> {
    const file = path.join(repo, ".env");
    if (!existsSync(file)) return {};
    const values: Record<string, string> = {};
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (!match) continue;
        values[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
    return values;
}

const env = fileEnv();
const requestedVitePort =
    Number(process.env.VITE_PORT ?? env.VITE_PORT) || 3000;
const lowMemory =
    process.env.MIMI_DEV_LOWMEM === "1" || env.MIMI_DEV_LOWMEM === "1";

function portFree(port: number, host = "0.0.0.0"): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.unref();
        server.once("error", () => resolve(false));
        server.listen(port, host, () => server.close(() => resolve(true)));
    });
}

async function healthy(url: string, timeout = 1500): Promise<boolean> {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
        return res.ok;
    } catch {
        return false;
    }
}

async function waitFor(
    check: () => Promise<boolean>,
    seconds: number,
    label: string,
): Promise<void> {
    const deadline = Date.now() + seconds * 1000;
    while (Date.now() < deadline) {
        if (await check()) return;
        await Bun.sleep(500);
    }
    fail(`${label} did not become ready`);
}

async function waitForBackends(): Promise<BackendsLock> {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
        const lock = readBackendsLock();
        if (
            lock &&
            (await healthy(`http://127.0.0.1:${lock.pbPort}/api/health`)) &&
            (await healthy(`http://127.0.0.1:${lock.apiPort}/api/health`))
        ) {
            return lock;
        }
        await Bun.sleep(500);
    }
    fail("the backend stack did not become ready");
}

async function pickVitePort(): Promise<number> {
    for (let port = requestedVitePort; port < requestedVitePort + 20; port++) {
        if (!(await portFree(port))) {
            log(`port ${port} is busy; trying ${port + 1} for Vite`);
            continue;
        }
        return port;
    }
    fail(`no free port near ${requestedVitePort} for Vite`);
}

function localAddresses(): string[] {
    const found: string[] = [];
    for (const [name, addresses] of Object.entries(networkInterfaces())) {
        if (/loopback/i.test(name)) continue;
        for (const address of addresses ?? []) {
            if (address.family === "IPv4" && !address.internal) {
                found.push(address.address);
            }
        }
    }
    return [...new Set(found)];
}

const children: ChildProcess[] = [];
let stopping = false;

function killTree(child: ChildProcess | null) {
    if (!child?.pid) return;
    if (isWindows) {
        spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
            stdio: "ignore",
        });
        return;
    }
    try {
        process.kill(child.pid, "SIGTERM");
    } catch {
        // already gone
    }
}

function cleanup() {
    if (stopping) return;
    stopping = true;
    for (const child of [...children].reverse()) killTree(child);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
        cleanup();
        process.exit(0);
    });
}
if (isWindows) {
    process.on("SIGBREAK", () => {
        cleanup();
        process.exit(0);
    });
}
process.on("exit", cleanup);

// ---------------------------------------------------------------------------

log("starting PocketBase + the API (scripts/backends.ts)");
const backends = spawn(process.execPath, ["scripts/backends.ts"], {
    cwd: repo,
    stdio: "inherit",
});
children.push(backends);
const { pbPort, apiPort } = await waitForBackends();

const vitePort = await pickVitePort();
log(`starting Vite on 0.0.0.0:${vitePort} (PB :${pbPort}, API :${apiPort})`);
if (lowMemory) {
    log(
        `low-memory mode: RAYON_NUM_THREADS=${process.env.RAYON_NUM_THREADS ?? 1}`,
    );
}
const vite = spawn(process.execPath, ["run", "dev:frontend"], {
    cwd: repo,
    stdio: "inherit",
    env: {
        ...process.env,
        ...(lowMemory && !process.env.RAYON_NUM_THREADS
            ? { RAYON_NUM_THREADS: "1" }
            : {}),
        VITE_PORT: String(vitePort),
        PB_PORT: String(pbPort),
        API_PORT: String(apiPort),
        VITE_POCKETBASE_URL: "same-origin",
    },
});
children.push(vite);
await waitFor(() => healthy(`http://127.0.0.1:${vitePort}/`, 2000), 90, "Vite");

const lanIps = localAddresses();

const lanIp = lanIps[0];
let lanOk = false;
if (lanIp) {
    try {
        const res = await fetch(`http://${lanIp}:${vitePort}/`, {
            signal: AbortSignal.timeout(4000),
        });
        lanOk = res.ok;
    } catch {
        lanOk = false;
    }
}

console.log("");
console.log("  Phone / other devices on the same Wi-Fi:");
if (lanIp) {
    console.log(`      http://${lanIp}:${vitePort}`);
    if (lanIps.length > 1) {
        console.log(`  Also: ${lanIps.slice(1).join(", ")}`);
    }
} else {
    console.log("      could not detect the LAN IP; check ipconfig / ip addr");
}
console.log("");
console.log("  This machine:");
console.log(`      http://127.0.0.1:${vitePort}`);
console.log(`      PocketBase dashboard: http://127.0.0.1:${pbPort}/_/`);
console.log("");
console.log("  Ctrl-C stops Vite, the API and PocketBase (if started here).");
console.log("");

if (lanIp && !lanOk) {
    console.error(
        "  warning: the LAN address did not answer. Check the firewall " +
            "(allow Node/Bun/PocketBase) and that the network is private.\n",
    );
}

await new Promise<void>((resolve) => {
    for (const child of children) child.once("exit", () => resolve());
    if (isWindows) process.once("SIGBREAK", () => resolve());
});

cleanup();
