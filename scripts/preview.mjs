#!/usr/bin/env bun
/**
 * Preview the production build, for visual checks on a machine that cannot
 * afford a dev server plus a browser at the same time.
 *
 *   bun scripts/preview.mjs
 *
 * Builds the app, starts PocketBase + the Bun supervisor (`bun run db`), and
 * serves `build/` the way the self-hosted deployment does: static files with an
 * SPA fallback, `/db` proxied to PocketBase (prefix stripped) and `/api`
 * proxied to the supervisor. Then point a browser at the printed URL.
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
 *   SUPERVISOR_PORT  (default 9110) Bun supervisor, serves /api
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const ROOT = process.cwd();
if (!existsSync(`${ROOT}/pocketbase`) || !existsSync(`${ROOT}/package.json`)) {
    console.error("run this from the repo root");
    process.exit(1);
}

const PORT = Number(process.env.PREVIEW_PORT ?? 4500);
const PB_PORT = Number(process.env.PB_PORT ?? 8110);
const API_PORT = Number(process.env.SUPERVISOR_PORT ?? 9110);
const BUILD_DIR = `${ROOT}/build`;
const PB_HEALTH = `http://127.0.0.1:${PB_PORT}/api/health`;

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
// backends: PocketBase + the Bun supervisor, as `bun run db` starts them.
// The dev seed creates test@mimi.local on first run.

async function healthy(url) {
    try {
        const res = await fetch(url);
        return res.ok;
    } catch {
        return false;
    }
}

async function waitFor(url, label) {
    for (let i = 0; i < 120; i++) {
        if (await healthy(url)) return;
        await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`${label} did not come up on ${url}`);
}

let db = null;

if (await healthy(PB_HEALTH)) {
    console.log(`reusing PocketBase already listening on 127.0.0.1:${PB_PORT}`);
} else {
    db = spawn("bun", ["run", "db"], {
        cwd: ROOT,
        stdio: ["ignore", "inherit", "inherit"],
        detached: true,
        env: {
            ...process.env,
            PB_PORT: String(PB_PORT),
            SUPERVISOR_PORT: String(API_PORT),
        },
    });
    await waitFor(PB_HEALTH, "PocketBase");
}

process.on("exit", () => {
    if (!db?.pid) return;
    try {
        process.kill(-db.pid, "SIGTERM");
    } catch {}
});
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
            return proxy(req, `http://127.0.0.1:${PB_PORT}`, "/db");
        if (url.pathname.startsWith("/api/"))
            return proxy(req, `http://127.0.0.1:${API_PORT}`, "");
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
        `  /db  -> PocketBase 127.0.0.1:${PB_PORT}`,
        `  /api -> supervisor 127.0.0.1:${API_PORT}`,
        "  log in as test@mimi.local / mimi123456 (dev seed)",
        "  ctrl-c stops the preview and its backends",
        "",
    ].join("\n"),
);
