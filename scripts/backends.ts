/**
 * Local backend stack: PocketBase + the Bun API, as two child processes.
 *
 *   bun run db          # foreground: starts both (or attaches to a healthy
 *                       # pair already running for this worktree)
 *   bun scripts/backends.ts
 *
 * `bun scripts/dev.ts` spawns this and adds Vite on top. The lock file lives
 * in `pb_data` so a second run in the same worktree never opens the SQLite
 * database twice.
 */

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

import { ensureBinary } from "./pb-binary";

const repo = path.resolve(import.meta.dir, "..");
const pbDir = path.join(repo, "pocketbase");
const dataDir = path.join(pbDir, "pb_data");
const lockFile = path.join(dataDir, ".dev-server.json");
const buildDir = path.join(repo, "build");
const isWindows = process.platform === "win32";

const log = (message: string) => console.log(`[db] ${message}`);

export type BackendsLock = {
    pid: number;
    pbPort: number;
    apiPort: number;
};

/** `.env` is optional; Bun loads it too, but this keeps debugging simple. */
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
const requestedPbPort = Number(process.env.PB_PORT ?? env.PB_PORT) || 8090;
const requestedApiPort =
    Number(process.env.SUPERVISOR_PORT ?? env.SUPERVISOR_PORT) || 9001;

export function readBackendsLock(): BackendsLock | null {
    try {
        const parsed = JSON.parse(readFileSync(lockFile, "utf8")) as {
            pid?: unknown;
            pbPort?: unknown;
            apiPort?: unknown;
            // The pre-container supervisor used `port` / `supervisorPort`.
            port?: unknown;
            supervisorPort?: unknown;
        };
        const pbPort = parsed.pbPort ?? parsed.port;
        const apiPort = parsed.apiPort ?? parsed.supervisorPort;
        if (
            typeof parsed.pid !== "number" ||
            typeof pbPort !== "number" ||
            typeof apiPort !== "number"
        ) {
            return null;
        }
        return { pid: parsed.pid, pbPort, apiPort };
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

function portFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.unref();
        server.once("error", () => resolve(false));
        server.listen(port, "127.0.0.1", () =>
            server.close(() => resolve(true)),
        );
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

const pbHealth = (port: number) =>
    healthy(`http://127.0.0.1:${port}/api/health`);
const apiHealth = (port: number) =>
    healthy(`http://127.0.0.1:${port}/api/health`);

async function waitFor(
    check: () => Promise<boolean>,
    seconds: number,
    label: string,
): Promise<void> {
    const deadline = Date.now() + seconds * 1000;
    while (Date.now() < deadline) {
        if (await check()) return;
        await Bun.sleep(250);
    }
    throw new Error(`${label} did not become ready`);
}

async function pickPort(start: number, label: string): Promise<number> {
    for (let port = start; port < start + 20; port++) {
        if (await portFree(port)) return port;
        log(`port ${port} is busy; trying ${port + 1} for ${label}`);
    }
    throw new Error(`no free port near ${start} for ${label}`);
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

function cleanup(removeLock: boolean) {
    if (stopping) return;
    stopping = true;
    for (const child of children.reverse()) killTree(child);
    if (removeLock) {
        const lock = readBackendsLock();
        if (lock?.pid === process.pid) {
            try {
                rmSync(lockFile, { force: true });
            } catch {
                // ignore
            }
        }
    }
}

async function main() {
    const existing = readBackendsLock();
    if (existing && pidAlive(existing.pid)) {
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
            if (
                (await pbHealth(existing.pbPort)) &&
                (await apiHealth(existing.apiPort))
            ) {
                log(
                    `reusing PocketBase :${existing.pbPort} and API :${existing.apiPort}`,
                );
                console.log(
                    `      PocketBase dashboard: http://127.0.0.1:${existing.pbPort}/_/`,
                );
                // Keep the process alive without owning the running pair;
                // Ctrl-C only detaches here.
                await new Promise<void>((resolve) => {
                    const timer = setInterval(() => {
                        if (!pidAlive(existing.pid)) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 2000);
                    process.once("SIGINT", () => {
                        clearInterval(timer);
                        resolve();
                    });
                    process.once("SIGTERM", () => {
                        clearInterval(timer);
                        resolve();
                    });
                });
                process.exit(0);
            }
            await Bun.sleep(500);
        }
        throw new Error(
            `this worktree's stack (pid ${existing.pid}) is running but not healthy; stop it first`,
        );
    }
    if (existing) {
        // Stale lock from a killed process.
        try {
            rmSync(lockFile, { force: true });
        } catch {
            // ignore
        }
    }

    const pbPort = await pickPort(requestedPbPort, "PocketBase");
    const apiPort = await pickPort(requestedApiPort, "the API");
    const bin = await ensureBinary();

    log(`starting PocketBase on 127.0.0.1:${pbPort}`);
    const pb = spawn(
        bin,
        [
            "serve",
            "--http",
            `127.0.0.1:${pbPort}`,
            "--dir",
            dataDir,
            "--migrationsDir",
            path.join(pbDir, "pb_migrations"),
            "--hooksDir",
            path.join(pbDir, "pb_hooks"),
        ],
        {
            cwd: pbDir,
            stdio: "inherit",
            env: {
                ...process.env,
                MIMI_DEV: "1",
            },
        },
    );
    children.push(pb);
    await waitFor(() => pbHealth(pbPort), 120, "PocketBase");

    log(`starting the API on 127.0.0.1:${apiPort}`);
    const api = spawn(process.execPath, ["server/main.ts"], {
        cwd: repo,
        stdio: "inherit",
        env: {
            ...process.env,
            PB_URL: `http://127.0.0.1:${pbPort}`,
            PORT: String(apiPort),
            MIMI_DEV: "1",
            STATIC_DIR: buildDir,
        },
    });
    children.push(api);
    await waitFor(() => apiHealth(apiPort), 60, "the API");

    writeFileSync(
        lockFile,
        JSON.stringify({
            pid: process.pid,
            pbPort,
            apiPort,
        }),
    );

    console.log("");
    console.log("  Local stack:");
    console.log(`      PocketBase: http://127.0.0.1:${pbPort}/_/`);
    console.log(`      API:        http://127.0.0.1:${apiPort}/api/health`);
    console.log("      Test users: test@mimi.local / test2@mimi.local");
    console.log("      Password:   mimi123456");
    console.log("");

    for (const child of children) {
        child.on("exit", (code, signal) => {
            if (stopping) return;
            console.error(
                `[db] child exited (code=${code} signal=${signal}); stopping`,
            );
            cleanup(true);
            process.exit(1);
        });
    }

    for (const signal of ["SIGINT", "SIGTERM"] as const) {
        process.on(signal, () => {
            cleanup(true);
            process.exit(0);
        });
    }
    if (isWindows) {
        process.on("SIGBREAK", () => {
            cleanup(true);
            process.exit(0);
        });
    }
}

if (import.meta.main) {
    main().catch((error) => {
        console.error(
            `[db] error: ${error instanceof Error ? error.message : error}`,
        );
        cleanup(true);
        process.exit(1);
    });
}
