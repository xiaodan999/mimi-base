#!/usr/bin/env bun
/**
 * Mobile performance baseline for the production build.
 *
 *   bun scripts/perf.mjs [route ...]
 *
 * Boots PocketBase, serves `build/` the way the self-hosted deployment does
 * (static + SPA fallback + /db and /api proxies) and measures each route in
 * Chromium under a throttled profile: Fast 3G (1.6 Mbps, 150ms RTT) with a 4x
 * CPU slowdown, at 390x844 @2x.
 *
 * Playwright is not a dependency of the repo; install it once if the script
 * asks for it:
 *
 *   bun add -d playwright && bunx playwright install chromium
 *
 * Env: PERF_PORT (default 4500), PERF_BUILD=0 to skip the rebuild,
 * PERF_PLAYWRIGHT to point at another playwright install.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const PORT = Number(process.env.PERF_PORT ?? 4500);
const REQUESTED_PB_PORT = Number(process.env.PB_PORT ?? 8090);
const REQUESTED_API_PORT = Number(process.env.SUPERVISOR_PORT ?? 9001);
const LOCK_FILE = `${process.cwd()}/pocketbase/pb_data/.dev-server.json`;
const ROUTES = process.argv.slice(2).length
    ? process.argv.slice(2)
    : ["/home", "/jizhang", "/chat", "/study"];

const ROOT = process.cwd();
if (!existsSync(`${ROOT}/pocketbase`)) {
    console.error("run this from the repo root");
    process.exit(1);
}

// ---------------------------------------------------------------------------
// build

if (process.env.PERF_BUILD !== "0") {
    console.log("building…");
    const build = spawnSync("bun", ["run", "build"], {
        cwd: ROOT,
        env: { ...process.env, VITE_POCKETBASE_URL: "same-origin" },
        stdio: ["ignore", "ignore", "inherit"],
    });
    if (build.status !== 0) process.exit(build.status ?? 1);
}

// ---------------------------------------------------------------------------
// backends: PocketBase + the Bun API (`scripts/backends.ts`). The dev seed
// creates test@mimi.local on first run.

function readLock() {
    try {
        const parsed = JSON.parse(readFileSync(LOCK_FILE, "utf8"));
        const pbPort = parsed.pbPort ?? parsed.port;
        const apiPort = parsed.apiPort ?? parsed.supervisorPort;
        if (typeof pbPort !== "number" || typeof apiPort !== "number") {
            return null;
        }
        return { pbPort, apiPort };
    } catch {
        return null;
    }
}

const db = spawn("bun", ["scripts/backends.ts"], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "inherit"],
    detached: true,
    env: {
        ...process.env,
        PB_PORT: String(REQUESTED_PB_PORT),
        SUPERVISOR_PORT: String(REQUESTED_API_PORT),
    },
});

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

async function waitForStack() {
    for (let i = 0; i < 720; i++) {
        const lock = readLock();
        if (lock) {
            try {
                const [pb, api] = await Promise.all([
                    fetch(`http://127.0.0.1:${lock.pbPort}/api/health`),
                    fetch(`http://127.0.0.1:${lock.apiPort}/api/health`),
                ]);
                if (pb.ok && api.ok) return lock;
            } catch {}
        }
        await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("the backend stack did not come up");
}
const { pbPort, apiPort } = await waitForStack();

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
const server = Bun.serve({
    port: PORT,
    hostname: "127.0.0.1",
    async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname.startsWith("/db/"))
            return proxy(req, `http://127.0.0.1:${pbPort}`, "/db");
        if (url.pathname.startsWith("/api/"))
            return proxy(req, `http://127.0.0.1:${apiPort}`, "");
        const path = url.pathname === "/" ? "/index.html" : url.pathname;
        const file = Bun.file(`${ROOT}/build${path}`);
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
        return new Response(Bun.file(`${ROOT}/build/index.html`), {
            headers: {
                "content-type": types.html,
                "cache-control": "no-cache",
            },
        });
    },
});
const BASE = `http://127.0.0.1:${PORT}`;

// ---------------------------------------------------------------------------
// measurement

let chromium;
try {
    ({ chromium } = await import(process.env.PERF_PLAYWRIGHT ?? "playwright"));
} catch {
    console.error(
        "perf needs Playwright:\n" +
            "  bun add -d playwright && bunx playwright install chromium",
    );
    process.exit(1);
}

const INIT = () => {
    const perf = { lcp: 0, lcpEl: "", cls: 0, longTasks: 0, longTaskTime: 0 };
    window.__perf = perf;
    new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
            perf.lcp = e.startTime;
            perf.lcpEl = e.element
                ? `${e.element.tagName}.${String(e.element.className).slice(0, 36)}`
                : e.url;
        }
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
        for (const e of list.getEntries())
            if (!e.hadRecentInput) perf.cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
            perf.longTasks += 1;
            perf.longTaskTime += e.duration;
        }
    }).observe({ type: "longtask", buffered: true });
};

const browser = await chromium.launch();
const mobile = {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
};

// Log in once without throttling; every measured route reuses the session.
const warm = await browser.newContext(mobile);
const wp = await warm.newPage();
await wp.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await wp.fill('input[placeholder="123@qq.com"]', "test@mimi.local");
await wp.fill('input[type="password"]', "mimi123456");
await wp.click('button[type="submit"]');
await wp.waitForURL(/\/home/, { timeout: 30000 });
const state = await warm.storageState();
await warm.close();

console.log(
    "\nroute      LCP     FCP    TTFB   CLS    long tasks   load    req   KB",
);
const rows = [];
for (const route of ROUTES) {
    const context = await browser.newContext({
        ...mobile,
        storageState: state,
    });
    const page = await context.newPage();
    await page.addInitScript(INIT);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 150,
        downloadThroughput: Math.round((1.6 * 1024 * 1024) / 8),
        uploadThroughput: Math.round((750 * 1024) / 8),
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    const t0 = Date.now();
    await page.goto(BASE + route, { waitUntil: "load", timeout: 120000 });
    const loadMs = Date.now() - t0;
    await page.waitForTimeout(8000);
    const m = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        const res = performance.getEntriesByType("resource");
        const total = res.reduce((n, r) => n + (r.transferSize || 0), 0);
        return {
            ...window.__perf,
            ttfb: nav.responseStart,
            fcp:
                performance.getEntriesByName("first-contentful-paint")[0]
                    ?.startTime ?? 0,
            requests: res.length,
            kb: Math.round(total / 1024),
        };
    });
    rows.push({ route, ...m, loadMs });
    console.log(
        `${route.padEnd(10)} ${String(Math.round(m.lcp)).padStart(5)}ms ` +
            `${String(Math.round(m.fcp)).padStart(5)}ms ` +
            `${String(Math.round(m.ttfb)).padStart(5)}ms ` +
            `${m.cls.toFixed(3).padStart(6)} ` +
            `${String(`${m.longTasks}/${Math.round(m.longTaskTime)}ms`).padStart(12)} ` +
            `${String(loadMs).padStart(5)}ms ${String(m.requests).padStart(4)} ` +
            `${String(m.kb).padStart(4)}`,
    );
    if (process.env.PERF_VERBOSE) console.log(`           LCP: ${m.lcpEl}`);
    await context.close();
}

await browser.close();
server.stop(true);
killBackends();
