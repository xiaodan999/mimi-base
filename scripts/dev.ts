/**
 * Local dev convenience: one command for the whole stack.
 *
 *   bun run dev:all   # PocketBase on :8090, then Vite on :3000
 *
 * Set VITE_PORT to run Vite on another port (e.g. when another worktree owns
 * :3000). `bun run dev` reads the same variable through vite.config.ts.
 *
 * Set PB_PORT (or PB_HTTP) to give this worktree its own database; the script
 * starts PocketBase on that port and points the Vite child's
 * VITE_POCKETBASE_URL at it. Each worktree keeps its own pocketbase/pb_data,
 * so two checkouts can run side by side.
 *
 * `bun run db` and `bun run dev` stay independent on purpose (see AGENTS.md):
 * this script only starts them in order, waits for PocketBase's /api/health
 * so the first feed query doesn't fail, and forwards Ctrl-C to both children.
 * If PocketBase is already serving on the dev port, it is reused untouched.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dir, "..");
const HEALTH_TIMEOUT = 120_000;
const pbOverride = process.env.PB_PORT ?? process.env.PB_HTTP;
const pbHttp =
    process.env.PB_HTTP ?? `127.0.0.1:${process.env.PB_PORT ?? "8090"}`;
const pbPort = pbHttp.split(":").pop() || "8090";
const pbHealthUrl = `http://127.0.0.1:${pbPort}/api/health`;
// The address a browser can use; 0.0.0.0 is a bind address, not a host.
const pbHost = pbHttp.slice(0, pbHttp.lastIndexOf(":")) || "127.0.0.1";
const pbClientUrl = `http://${
    pbHost === "0.0.0.0" || pbHost === "::" ? "127.0.0.1" : pbHost
}:${pbPort}`;

let pb: ChildProcess | null = null;
let vite: ChildProcess | null = null;
let stopping = false;

const log = (msg: string) => console.log(`[dev] ${msg}`);

async function isPbHealthy(): Promise<boolean> {
    try {
        const res = await fetch(pbHealthUrl, {
            signal: AbortSignal.timeout(1000),
        });
        return res.ok;
    } catch {
        return false;
    }
}

function shutdown(code: number): never {
    if (stopping) process.exit(code);
    stopping = true;
    vite?.kill("SIGTERM");
    pb?.kill("SIGTERM");
    process.exit(code);
}

function startPB() {
    log(`starting PocketBase on ${pbHttp}`);
    pb = spawn(process.execPath, ["pocketbase/server.ts"], {
        cwd: repo,
        stdio: "inherit",
        env: process.env,
    });
    pb.on("exit", (code, signal) => {
        pb = null;
        if (stopping) return;
        log(`PocketBase exited (code=${code} signal=${signal})`);
        shutdown(code ?? 1);
    });
}

async function waitForPB(): Promise<boolean> {
    const deadline = Date.now() + HEALTH_TIMEOUT;
    while (Date.now() < deadline) {
        if (stopping) return false;
        if (await isPbHealthy()) return true;
        await Bun.sleep(500);
    }
    return false;
}

function startVite() {
    log(`starting Vite on :${process.env.VITE_PORT ?? "3000"}`);
    const env = { ...process.env };
    if (pbOverride) {
        // Keep the client and the database we started on the same port. Vite
        // gives process env priority over `.env`.
        env.VITE_POCKETBASE_URL = pbClientUrl;
        log(`pointing Vite at ${pbClientUrl}`);
    }
    vite = spawn(process.execPath, ["run", "dev"], {
        cwd: repo,
        stdio: "inherit",
        env,
    });
    vite.on("exit", (code, signal) => {
        vite = null;
        if (stopping) return;
        log(`Vite exited (code=${code} signal=${signal})`);
        shutdown(code ?? 1);
    });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

if (!existsSync(path.join(repo, ".env"))) {
    log("warning: .env is missing — run `cp .env.example .env`");
}

if (await isPbHealthy()) {
    log(`reusing PocketBase already running at ${pbHealthUrl}`);
} else {
    startPB();
    log("waiting for PocketBase (first run downloads the binary)...");
    if (!(await waitForPB())) {
        log(`PocketBase not healthy after ${HEALTH_TIMEOUT / 1000}s`);
        shutdown(1);
    }
    log("PocketBase is up");
}

startVite();
