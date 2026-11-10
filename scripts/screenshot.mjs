#!/usr/bin/env bun
/**
 * Screenshot the preview build, for visual review by an agent that has no
 * in-app browser.
 *
 *   bun run preview          # in another terminal, or `PREVIEW_URL=...`
 *   bun scripts/screenshot.mjs [/home /chat ...]
 *
 * Logs in with the dev seed account, then captures each route into
 * `tmp/shots/<route>.png` at a 430x932 phone viewport.
 *
 * This uses playwright-core, not playwright: the browsers Playwright downloads
 * are glibc builds and segfault on Alpine/musl (the dev container), so the
 * package here has no browser download and the executable is resolved from the
 * system instead. Point CHROMIUM_PATH at a browser if the defaults are wrong.
 *
 * The app is auth-only, so a plain `chromium --screenshot` cannot capture it —
 * something has to log in first, which is why this is a script.
 *
 * Env:
 *   PREVIEW_URL        (default http://127.0.0.1:4500)
 *   CHROMIUM_PATH      (default: first of /usr/bin/chromium,
 *                       /usr/bin/chromium-browser, /usr/bin/google-chrome,
 *                       /usr/bin/google-chrome-stable)
 *   SCREENSHOT_DIR     (default tmp/shots)
 *   SCREENSHOT_SCALE   (default 1; 2 is retina and doubles raster memory)
 *   SCREENSHOT_EMAIL   / SCREENSHOT_PASSWORD  (default dev seed test account)
 */

import { existsSync, mkdirSync } from "node:fs";

const BASE = (process.env.PREVIEW_URL ?? "http://127.0.0.1:4500").replace(
    /\/+$/,
    "",
);
const OUT_DIR = process.env.SCREENSHOT_DIR ?? "tmp/shots";
const SCALE = Number(process.env.SCREENSHOT_SCALE ?? 1) || 1;
const EMAIL = process.env.SCREENSHOT_EMAIL ?? "test@mimi.local";
const PASSWORD = process.env.SCREENSHOT_PASSWORD ?? "mimi123456";
const ROUTES = process.argv.slice(2).length
    ? process.argv.slice(2)
    : ["/home", "/jizhang", "/chat", "/study"];

const CANDIDATES = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
];
const executablePath =
    process.env.CHROMIUM_PATH ??
    CANDIDATES.find((candidate) => existsSync(candidate));

if (!executablePath) {
    console.error(
        "no system Chromium found — install one or set CHROMIUM_PATH.\n" +
            "do NOT fall back to `playwright`'s own browsers: they are glibc\n" +
            "builds and segfault on Alpine/musl",
    );
    process.exit(1);
}

try {
    const res = await fetch(`${BASE}/`);
    if (!res.ok) throw new Error(String(res.status));
} catch {
    console.error(
        `nothing answering at ${BASE} — run \`bun run preview\` first`,
    );
    process.exit(1);
}

let chromium;
try {
    ({ chromium } = await import("playwright-core"));
} catch {
    console.error(
        "playwright-core is missing — run `bun install`\n" +
            "do NOT install `playwright`: its browsers are glibc builds and\n" +
            "segfault on Alpine/musl",
    );
    process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
    executablePath,
    args: [
        // Root inside a container.
        "--no-sandbox",
        // The container has a 64MB /dev/shm; without this Chromium crashes.
        "--disable-dev-shm-usage",
        "--disable-gpu",
    ],
});

try {
    const context = await browser.newContext({
        viewport: { width: 430, height: 932 },
        deviceScaleFactor: SCALE,
    });
    const page = await context.newPage();

    // Log in. The dev quick-login card is gated on import.meta.env.DEV, and
    // this serves a production build, so fill the form.
    await page.goto(`${BASE}/login`, { waitUntil: "load" });
    await page.fill('input[placeholder="123@qq.com"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await Promise.all([
        page
            .waitForURL((url) => !url.pathname.startsWith("/login"), {
                timeout: 15000,
            })
            .catch(() => {}),
        page.click('button[type="submit"]'),
    ]);
    if (new URL(page.url()).pathname.startsWith("/login")) {
        console.error(`login failed as ${EMAIL} — is this the dev database?`);
        process.exit(1);
    }

    for (const route of ROUTES) {
        await page.goto(`${BASE}${route}`, { waitUntil: "load" });
        // The shell is 100dvh with its own scroll container, so a viewport
        // screenshot is the whole screen; fullPage would not add anything.
        // Realtime sockets keep the network busy, so settle on a timer.
        await page.waitForTimeout(1200);
        const name = `${route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root"}.png`;
        const file = `${OUT_DIR}/${name}`;
        await page.screenshot({ path: file });
        console.log(file);
    }

    await context.close();
} finally {
    await browser.close();
}
