#!/usr/bin/env bun
/**
 * Preview the production build, for visual checks on a machine that cannot
 * afford a dev server plus a browser at the same time.
 *
 *   bun scripts/preview.mjs
 *
 * Builds the app, starts PocketBase + the Bun API (`bun scripts/backends.ts`),
 * and serves `build/` the way the self-hosted deployment does: static files
 * with an SPA fallback, `/db` proxied to PocketBase (prefix stripped) and
 * `/api` proxied to the API. Then point a browser at the printed URL.
 *
 * This replaces `bun run dev` for verification only. A Vite dev server keeps a
 * ~430MB process alive that serves the same thing; this adds ~30MB. It also
 * costs a `bun run build` per iteration — there is no hot reload.
 *
 * The build is always made with VITE_POCKETBASE_URL=same-origin, so the bundle
 * talks to whatever origin serves it and the proxies below do the rest. Do not
 * reuse a build made for another origin.
 *
 * Env:
 *   PREVIEW_PORT     (default 4500) where the preview server listens
 *   PREVIEW_BUILD=0  skip `bun run build`
 *   PB_PORT          (default 8110) PocketBase
 *   API_PORT         (default 9110) Bun API, serves /api
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const ROOT = process.cwd();
if (!existsSync(`${ROOT}/pocketbase`) || !existsSync(`${ROOT}/package.json`)) {
    console.error("run this from the repo root");
    process.exit(1);
}

const PORT = Number(process.env.PREVIEW_PORT ?? 4500);
const REQUESTED_PB_PORT = Number(process.env.PB_PORT ?? 8110);
const REQUESTED_API_PORT = Number(process.env.API_PORT ?? 9110);
const BUILD_DIR = `${ROOT}/build`;
const LOCK_FILE = `${ROOT}/pocketbase/pb_data/.dev-server.json`;

// ---------------------------------------------------------------------------
// build

if (process.env.PREVIEW_BUILD !== "0") {
    console.log("building…");
    const build = spawnSync("bun", ["run", "build"], {
        cwd: ROOT,
        env: { ...process.env, VITE_POCKETBASE_URL: "same-origin" },
        stdio: ["ignore", "ignore", "inherit"],
    });
    if (build.status !== 0) process.exit(build.status ?? 1);
} else if (!existsSync(`${BUILD_DIR}/index.html`)) {
    console.error("PREVIEW_BUILD=0 but build/index.html is missing");
    process.exit(1);
}

// ---------------------------------------------------------------------------
// backends: PocketBase + the Bun API (`scripts/backends.ts`). The dev seed
// creates test@mimi.local on first run.

async function healthy(url) {
    try {
        const res = await fetch(url);
        return res.ok;
    } catch {
        return false;
    }
}

function readLock() {
    try {
        const parsed = JSON.parse(readFileSync(LOCK_FILE, "utf8"));
        const pbPort = parsed.pbPort;
        const apiPort = parsed.apiPort;
        if (typeof pbPort !== "number" || typeof apiPort !== "number") {
            return null;
        }
        return { pbPort, apiPort };
    } catch {
        return null;
    }
}

async function waitForStack() {
    for (let i = 0; i < 720; i++) {
        const lock = readLock();
        if (
            lock &&
            (await healthy(`http://127.0.0.1:${lock.pbPort}/api/health`)) &&
            (await healthy(`http://127.0.0.1:${lock.apiPort}/api/health`))
        ) {
            return lock;
        }
        await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("the backend stack did not come up");
}

const db = spawn("bun", ["scripts/backends.ts"], {
    cwd: ROOT,
    stdio: ["ignore", "inherit", "inherit"],
    detached: true,
    env: {
        ...process.env,
        PB_PORT: String(REQUESTED_PB_PORT),
        API_PORT: String(REQUESTED_API_PORT),
    },
});
const { pbPort, apiPort } = await waitForStack();

function killBackends() {
    if (!db?.pid) return;
    if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(db.pid), "/t", "/f"], {
            stdio: "ignore",
        });
        return;
    }
    try {
        process.kill(-db.pid, "SIGTERM");
    } catch {}
}
process.on("exit", killBackends);
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => process.exit(0));
}

// ---------------------------------------------------------------------------
// static server: same layout as production (gzip, immutable hashed assets)

const types = {
    html: "text/html; charset=utf-8",
    js: "text/javascript; charset=utf-8",
    css: "text/css; charset=utf-8",
    json: "application/json; charset=utf-8",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    ico: "image/x-icon",
    mp4: "video/mp4",
    webmanifest: "application/manifest+json",
    woff2: "font/woff2",
};

async function proxy(req, base, strip) {
    const url = new URL(req.url);
    const target =
        base +
        (strip ? url.pathname.slice(strip.length) : url.pathname) +
        url.search;
    const headers = new Headers(req.headers);
    headers.delete("host");
    const res = await fetch(target, {
        method: req.method,
        headers,
        body:
            req.method === "GET" || req.method === "HEAD"
                ? undefined
                : req.body,
        redirect: "manual",
    });
    const out = new Headers(res.headers);
    out.delete("content-encoding");
    out.delete("content-length");
    return new Response(res.body, { status: res.status, headers: out });
}

const gz = new Map();
Bun.serve({
    port: PORT,
    hostname: "127.0.0.1",
    async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname.startsWith("/db/"))
            return proxy(req, `http://127.0.0.1:${pbPort}`, "/db");
        if (url.pathname.startsWith("/api/"))
            return proxy(req, `http://127.0.0.1:${apiPort}`, "");
        const path = url.pathname === "/" ? "/index.html" : url.pathname;
        const file = Bun.file(`${BUILD_DIR}${path}`);
        if (await file.exists()) {
            const ext = path.split(".").pop() ?? "";
            const headers = {
                "content-type": types[ext] ?? "application/octet-stream",
                "cache-control": path.startsWith("/assets/")
                    ? "public, max-age=31536000, immutable"
                    : "no-cache",
            };
            const compressible = /^(html|js|css|json|svg|webmanifest)$/.test(
                ext,
            );
            if (
                compressible &&
                (req.headers.get("accept-encoding") ?? "").includes("gzip")
            ) {
                let body = gz.get(path);
                if (!body) {
                    body = Bun.gzipSync(Buffer.from(await file.arrayBuffer()));
                    gz.set(path, body);
                }
                return new Response(body, {
                    headers: { ...headers, "content-encoding": "gzip" },
                });
            }
            return new Response(file, { headers });
        }
        // SPA fallback: the router owns these paths.
        return new Response(Bun.file(`${BUILD_DIR}/index.html`), {
            headers: {
                "content-type": types.html,
                "cache-control": "no-cache",
            },
        });
    },
});

const BASE = `http://127.0.0.1:${PORT}`;
console.log(
    [
        "",
        `preview ready: ${BASE}`,
        `  /db  -> PocketBase 127.0.0.1:${pbPort}`,
        `  /api -> the API 127.0.0.1:${apiPort}`,
        "  log in as test@mimi.local / mimi123456 (dev seed)",
        "  ctrl-c stops the preview and its backends",
        "",
    ].join("\n"),
);
