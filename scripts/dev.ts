/**
 * `bun run dev:all` — PocketBase + Vite, always reachable from the LAN.
 *
 * Works on Linux, WSL2 and plain Windows:
 * - Linux / Windows: Vite already listens on 0.0.0.0, only the URL is printed.
 * - WSL2 (NAT): the phone cannot reach the VM, so a tiny forwarder runs on the
 *   Windows host (scripts/lan-proxy.mjs, executed by the Windows node.exe,
 *   which already has inbound firewall rules). Only Vite's port is forwarded;
 *   PocketBase stays on loopback and Vite proxies `/api` to it, so the client
 *   can use same-origin URLs (see vite.config.ts + lib/env.ts).
 *
 * Each worktree keeps its own `pocketbase/pb_data/` and its own stack. Busy
 * ports are skipped (on both sides under WSL), and a PocketBase already
 * running for this checkout is reused instead of opening the database twice.
 *
 *   bun run dev:all
 *   VITE_PORT=3005 PB_PORT=8091 bun run dev:all
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { networkInterfaces } from "node:os";
import path from "node:path";

const repo = path.resolve(import.meta.dir, "..");
process.chdir(repo);

const isWindows = process.platform === "win32";
const isWsl =
    !isWindows &&
    existsSync("/proc/version") &&
    readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft");

const log = (message: string) => console.log(`[dev:all] ${message}`);

function fail(message: string): never {
    console.error(`[dev:all] error: ${message}`);
    process.exit(1);
}

/** `.env` is optional; Bun also loads it, but this keeps plain node happy. */
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
const requestedSupervisorPort =
    Number(process.env.SUPERVISOR_PORT ?? env.SUPERVISOR_PORT) || 9001;
let pbPort = Number(process.env.PB_PORT ?? env.PB_PORT) || 8090;

function portFree(port: number, host = "0.0.0.0"): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.unref();
        server.once("error", () => resolve(false));
        server.listen(port, host, () => server.close(() => resolve(true)));
    });
}

async function pbHealthy(port: number, timeout = 1500): Promise<boolean> {
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
            signal: AbortSignal.timeout(timeout),
        });
        return res.ok;
    } catch {
        return false;
    }
}

async function viteHealthy(port: number): Promise<boolean> {
    try {
        const res = await fetch(`http://127.0.0.1:${port}/`, {
            signal: AbortSignal.timeout(2000),
        });
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

/**
 * PocketBase's supervisor writes this while it runs, so a second `dev:all`
 * in the same worktree can reuse it instead of touching the same SQLite file
 * twice.
 */
const pbLock = path.join(repo, "pocketbase", "pb_data", ".dev-server.json");

function readPbLock(): {
    pid: number;
    port: number;
    supervisorPort?: number;
} | null {
    try {
        const parsed = JSON.parse(readFileSync(pbLock, "utf8")) as {
            pid?: unknown;
            port?: unknown;
            supervisorPort?: unknown;
        };
        if (typeof parsed.pid !== "number" || typeof parsed.port !== "number") {
            return null;
        }
        return {
            pid: parsed.pid,
            port: parsed.port,
            supervisorPort:
                typeof parsed.supervisorPort === "number"
                    ? parsed.supervisorPort
                    : undefined,
        };
    } catch {
        return null;
    }
}

function pidAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function resolvePbPort(): Promise<{ port: number; reuse: boolean }> {
    const lock = readPbLock();
    if (lock && pidAlive(lock.pid)) {
        // The supervisor may still be applying migrations; don't open a second
        // process against the same pb_data while it starts up.
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
            if (await pbHealthy(lock.port)) {
                return { port: lock.port, reuse: true };
            }
            await Bun.sleep(500);
        }
        fail(
            `this worktree's PocketBase on :${lock.port} is running but not healthy; stop it first`,
        );
    }
    if (lock && (await pbHealthy(lock.port))) {
        fail(
            `PocketBase on :${lock.port} is still running but its supervisor is gone; stop it first`,
        );
    }

    for (let port = pbPort; port < pbPort + 20; port++) {
        if (await portFree(port, "127.0.0.1")) {
            return { port, reuse: false };
        }
        log(`port ${port} is busy; trying ${port + 1} for PocketBase`);
    }
    fail(`no free port near ${pbPort} for PocketBase`);
}

async function pickSupervisorPort(): Promise<number> {
    for (
        let port = requestedSupervisorPort;
        port < requestedSupervisorPort + 20;
        port++
    ) {
        if (await portFree(port, "127.0.0.1")) return port;
        log(`port ${port} is busy; trying ${port + 1} for the AI relay`);
    }
    fail(`no free port near ${requestedSupervisorPort} for the AI relay`);
}

async function relayHealthy(port: number): Promise<boolean> {
    try {
        const res = await fetch(`http://127.0.0.1:${port}/ai/health`, {
            signal: AbortSignal.timeout(1500),
        });
        return res.ok;
    } catch {
        return false;
    }
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

/** Windows-only helpers (WSL runs the forwarder with the Windows node). */
const WINDOWS_NODE_CANDIDATES = [
    process.env.WIN_NODE,
    "/mnt/c/Program Files/nodejs/node.exe",
];

function findWindowsNode(): string | null {
    for (const candidate of WINDOWS_NODE_CANDIDATES) {
        if (candidate && existsSync(candidate)) return candidate;
    }
    const which = spawnSync("which", ["node.exe"], { encoding: "utf8" });
    const found = which.stdout?.trim();
    return found && existsSync(found) ? found : null;
}

function windowsPortFree(port: number, winNode: string): boolean {
    const code = [
        'const net = require("node:net");',
        "const server = net.createServer();",
        "server.once('error', () => process.exit(1));",
        "server.listen(Number(process.argv[1]), '0.0.0.0', () =>",
        "  server.close(() => process.exit(0)),",
        ");",
    ].join("");
    return (
        spawnSync(winNode, ["-e", code, String(port)], {
            stdio: "ignore",
        }).status === 0
    );
}

const winNode = isWsl ? findWindowsNode() : null;

async function pickVitePort(): Promise<number> {
    for (let port = requestedVitePort; port < requestedVitePort + 20; port++) {
        const free = await portFree(port);
        if (!free) {
            log(`port ${port} is busy; trying ${port + 1} for Vite`);
            continue;
        }
        if (isWsl && winNode && !windowsPortFree(port, winNode)) {
            log(`port ${port} is busy on Windows; trying ${port + 1} for Vite`);
            continue;
        }
        return port;
    }
    fail(`no free port near ${requestedVitePort} for Vite`);
}

function readLanIps(proxy: ChildProcess): Promise<string[]> {
    return new Promise((resolve) => {
        let buffer = "";
        const timer = setTimeout(() => resolve([]), 5000);
        const finish = (value: string[]) => {
            clearTimeout(timer);
            resolve(value);
        };
        proxy.stdout?.on("data", (chunk: Buffer) => {
            buffer += chunk.toString();
            const line = buffer
                .split("\n")
                .find((entry) => entry.startsWith("LAN_IPS="));
            if (!line) return;
            finish(
                line
                    .slice("LAN_IPS=".length)
                    .split(",")
                    .map((entry) => entry.trim())
                    .filter(Boolean),
            );
        });
        proxy.once("exit", () => finish([]));
    });
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
    spawnSync("pkill", ["-TERM", "-P", String(child.pid)], {
        stdio: "ignore",
    });
    try {
        process.kill(child.pid, "SIGTERM");
    } catch {
        // already gone
    }
}

function cleanup() {
    if (stopping) return;
    stopping = true;
    // Reverse order: forwarder, frontend, database.
    for (const child of children.reverse()) killTree(child);
    if (!isWindows) {
        for (const child of children) {
            if (!child.pid) continue;
            try {
                process.kill(child.pid, "SIGKILL");
            } catch {
                // already gone
            }
        }
    }
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

const { port: resolvedPbPort, reuse } = await resolvePbPort();
pbPort = resolvedPbPort;

let supervisorPort: number;
if (reuse) {
    const lock = readPbLock();
    if (lock?.supervisorPort) {
        supervisorPort = lock.supervisorPort;
        log(
            `reusing this worktree's PocketBase on :${pbPort} and AI relay on :${supervisorPort}`,
        );
        if (!(await relayHealthy(supervisorPort))) {
            log(
                `AI relay on :${supervisorPort} is not responding; restart dev:all to enable streaming AI`,
            );
        }
    } else {
        supervisorPort = await pickSupervisorPort();
        log(
            "reused PocketBase has no AI relay; restart dev:all to enable streaming AI",
        );
    }
} else {
    supervisorPort = await pickSupervisorPort();
    log(`starting PocketBase on 127.0.0.1:${pbPort}`);
    const pbEnv: Record<string, string | undefined> = {
        ...process.env,
        PB_PORT: String(pbPort),
        SUPERVISOR_PORT: String(supervisorPort),
    };
    delete pbEnv.PB_HTTP;
    const pb = spawn(
        process.execPath,
        [path.join(repo, "pocketbase", "server.ts")],
        { cwd: repo, stdio: "inherit", env: pbEnv },
    );
    children.push(pb);
    await waitFor(() => pbHealthy(pbPort), 120, "PocketBase");
}

const vitePort = await pickVitePort();
log(
    `starting Vite on 0.0.0.0:${vitePort} (API via /api -> 127.0.0.1:${pbPort}, AI via /ai -> 127.0.0.1:${supervisorPort})`,
);
const vite = spawn(process.execPath, ["run", "dev"], {
    cwd: repo,
    stdio: "inherit",
    env: {
        ...process.env,
        VITE_PORT: String(vitePort),
        PB_PORT: String(pbPort),
        SUPERVISOR_PORT: String(supervisorPort),
        VITE_POCKETBASE_URL: "same-origin",
    },
});
children.push(vite);
await waitFor(() => viteHealthy(vitePort), 90, "Vite");

let lanIps: string[] = [];
let proxy: ChildProcess | null = null;
if (isWsl && winNode) {
    const proxyPath = path.join(repo, "scripts", "lan-proxy.mjs");
    const windowsPath = spawnSync("wslpath", ["-w", proxyPath], {
        encoding: "utf8",
    })
        .stdout.trim()
        .replace(/\\/g, "/");
    const wslIp = localAddresses()[0];
    if (!windowsPath || !wslIp) {
        log("warning: could not resolve the forwarder paths");
    } else {
        log(`forwarding Windows LAN :${vitePort} -> ${wslIp}:${vitePort}`);
        proxy = spawn(winNode, [windowsPath, wslIp, String(vitePort)], {
            stdio: ["ignore", "pipe", "pipe"],
        });
        children.push(proxy);
        proxy.stderr?.on("data", (chunk: Buffer) =>
            process.stderr.write(chunk),
        );
        lanIps = await readLanIps(proxy);
    }
} else {
    lanIps = localAddresses();
}

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
console.log(
    "  Ctrl-C stops Vite, PocketBase (if started here) and the forwarder.",
);
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
