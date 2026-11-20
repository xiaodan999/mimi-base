import { execSync } from "node:child_process";
import {
    cpSync,
    createReadStream,
    existsSync,
    readFileSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

// `process.env.npm_package_version` is undefined outside an npm/bun script,
// so read the version straight from package.json instead. `require` keeps this
// an ESM-safe read that also works when the config is bundled by Vite itself.
const require = createRequire(import.meta.url);
const pkg = require("./package.json") as { version: string };

/**
 * Full commit sha this bundle was built from. GitHub Actions exports
 * GITHUB_SHA, Vercel exports VERCEL_GIT_COMMIT_SHA (their checkout is not
 * always a usable git repository), and local builds fall back to
 * `git rev-parse HEAD`. It is written verbatim into `build/version.json` so
 * the post-deploy check can assert the *new* bundle is the one being served.
 */
function resolveAppSha(): string {
    const fromEnv =
        process.env.GITHUB_SHA ||
        process.env.GIT_SHA ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.VITE_APP_SHA;
    if (fromEnv) return fromEnv.trim();
    try {
        return execSync("git rev-parse HEAD", {
            cwd: process.cwd(),
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    } catch {
        return "dev";
    }
}

const appSha = resolveAppSha();

/**
 * `public/sw.js` used to carry a hand-edited `VERSION` ("v9.0.2") unrelated to
 * the deploy, so a byte-identical worker never triggered the "有新版本可用"
 * prompt. Generate the worker's VERSION from package.json + the commit sha at
 * build time and also emit `build/version.json` for deploy verification.
 *
 * Vite copies public/ into build/ during the build; `closeBundle` runs last, so
 * we overwrite that copy with the injected worker and add the version file.
 */
function swVersionPlugin(): Plugin {
    return {
        name: "mimi-sw-version",
        apply: "build",
        closeBundle() {
            const root = process.cwd();
            const outDir = path.join(root, "build");
            const src = readFileSync(
                path.join(root, "public", "sw.js"),
                "utf8",
            );
            const version = `v${pkg.version}-${appSha.slice(0, 12)}`;
            const injected = src.replace(
                /^const VERSION\s*=\s*.*?;\s*$/m,
                `const VERSION = ${JSON.stringify(version)};`,
            );
            if (injected === src)
                throw new Error("sw.js: could not find the VERSION anchor");
            writeFileSync(path.join(outDir, "sw.js"), injected);
            writeFileSync(
                path.join(outDir, "version.json"),
                `${JSON.stringify(
                    {
                        version: pkg.version,
                        sha: appSha,
                        appVersion: pkg.version,
                        swVersion: version,
                        builtAt: new Date().toISOString(),
                    },
                    null,
                    2,
                )}\n`,
            );
            console.log(
                `[sw-version] ${version} (sha ${appSha.slice(0, 12)}) -> build/sw.js, build/version.json`,
            );
        },
    };
}

/**
 * pdf.js fetches its CMaps and standard fonts at runtime. Serve them straight
 * from `node_modules` in dev and copy them into `build/pdfjs/` after bundling,
 * so Vercel, Docker, preview and CI all ship the same paths without generated
 * files in the repo. Without the CMaps some Chinese PDFs render blank.
 */
function pdfjsAssetsPlugin(): Plugin {
    const packageRoot = path.dirname(
        require.resolve("pdfjs-dist/package.json"),
    );
    const dirs = new Set(["cmaps", "standard_fonts"]);

    /** Map a `/pdfjs/<dir>/<file>` URL to a safe path under the package. */
    const resolveAsset = (url: string): string | null => {
        const pathname = url.split("?")[0] ?? "";
        if (!pathname.startsWith("/pdfjs/")) return null;
        let relative: string;
        try {
            relative = decodeURIComponent(pathname.slice("/pdfjs/".length));
        } catch {
            return null;
        }
        const [dir, ...rest] = relative.split("/");
        if (!dir || !dirs.has(dir)) return null;
        const name = rest.join("/");
        if (name === "" || name.includes("..") || path.isAbsolute(name)) {
            return null;
        }
        const base = path.join(packageRoot, dir);
        const target = path.join(base, name);
        return target.startsWith(base + path.sep) ? target : null;
    };

    return {
        name: "mimi-pdfjs-assets",
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const pathname = (req.url ?? "").split("?")[0] ?? "";
                if (!pathname.startsWith("/pdfjs/")) {
                    next();
                    return;
                }
                const target = resolveAsset(req.url ?? "");
                if (
                    !target ||
                    !existsSync(target) ||
                    !statSync(target).isFile()
                ) {
                    // Bad or missing asset: never fall through to the SPA
                    // fallback, which would hand pdf.js an HTML document.
                    res.statusCode = 404;
                    res.end("not found");
                    return;
                }
                // CMaps/fonts are read as ArrayBuffers by pdf.js; the exact
                // media type does not matter, but a binary type is honest.
                res.setHeader("Content-Type", "application/octet-stream");
                createReadStream(target).pipe(res);
            });
        },
        closeBundle() {
            const outDir = path.join(process.cwd(), "build", "pdfjs");
            for (const dir of dirs) {
                cpSync(path.join(packageRoot, dir), path.join(outDir, dir), {
                    recursive: true,
                });
            }
            console.log("[pdfjs-assets] build/pdfjs/{cmaps,standard_fonts}");
        },
    };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    // VITE_PORT may come from the shell or this worktree's `.env`, which is
    // handy when another checkout already owns :3000.
    const env = loadEnv(mode, process.cwd(), "");
    const port = Number(env.VITE_PORT) || 3000;

    // Dev serves the app through the same origin as PocketBase's API, so a
    // phone on the LAN only needs this one port. `dev:all` sets PB_PORT; plain
    // `bun run dev:frontend` falls back to the default PocketBase port.
    const pocketBasePort = Number(process.env.PB_PORT ?? env.PB_PORT) || 8090;

    // The Bun API serves the streaming AI relay and the other `/api` handlers.
    // `dev:all` picks a free port per worktree.
    const apiPort = Number(process.env.API_PORT ?? env.API_PORT) || 9001;

    // The first auth/profile request goes to a different origin; opening the
    // TCP+TLS connection while the entry chunk downloads saves a full RTT on
    // high-latency (especially cross-border) links.
    const preconnectPocketBase = {
        name: "preconnect-pocketbase",
        transformIndexHtml() {
            const raw = env.VITE_POCKETBASE_URL;
            if (!raw) return [];
            let origin: string;
            try {
                origin = new URL(raw).origin;
            } catch {
                return [];
            }
            return [
                {
                    tag: "link",
                    attrs: { rel: "preconnect", href: origin, crossorigin: "" },
                    injectTo: "head-prepend" as const,
                },
                {
                    tag: "link",
                    attrs: { rel: "dns-prefetch", href: origin },
                    injectTo: "head-prepend" as const,
                },
            ];
        },
    };

    return {
        server: {
            port,
            proxy: {
                // PocketBase lives under /db (see lib/env.ts). Strip the
                // prefix before handing the request to the PB server, which
                // only knows /api, /_/ and the public dir. ws keeps realtime.
                "/db": {
                    target: `http://127.0.0.1:${pocketBasePort}`,
                    ws: true,
                    rewrite: (path) => path.replace(/^\/db/, ""),
                    // Chromium can hold a stale keep-alive socket to the dev
                    // server after the realtime connection closes; a later
                    // POST then waits forever (a login stuck on "登录中").
                    // Close both sides after every proxied HTTP response so
                    // each request starts on a fresh connection.
                    configure: (proxy) => {
                        proxy.on("proxyReq", (proxyReq) => {
                            proxyReq.setHeader("Connection", "close");
                        });
                        proxy.on("proxyRes", (proxyRes) => {
                            proxyRes.headers.connection = "close";
                        });
                    },
                },
                // Hand-written Bun APIs: the streaming AI relay, feedback,
                // and any future backend handlers. xfwd forwards the phone's
                // address so /api/ai/geo/ip can tell the proxy hop from the
                // actual caller.
                "/api": {
                    target: `http://127.0.0.1:${apiPort}`,
                    xfwd: true,
                },
            },
        },
        // Vite 8 resolves tsconfig `paths` natively; no vite-tsconfig-paths plugin.
        resolve: {
            tsconfigPaths: true,
        },
        build: {
            outDir: "build",
            sourcemap: false,
            rollupOptions: {
                output: {
                    // Rolldown's replacement for the deprecated
                    // `manualChunks`. Long-lived vendor chunks keep app
                    // deploys from invalidating the framework code.
                    // `[\\/]` matters: module ids use backslashes on Windows.
                    codeSplitting: {
                        groups: [
                            {
                                name: "common/react-packages",
                                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                            },
                            {
                                name: "common/react-query",
                                test: /node_modules[\\/]@tanstack[\\/](react-query|query-core)[\\/]/,
                            },
                            {
                                name: "common/tanstack-router",
                                test: /node_modules[\\/]@tanstack[\\/](react-router|router-core|history|react-store|store)[\\/]/,
                            },
                        ],
                    },
                },
            },
        },
        plugins: [
            tailwindcss(),
            tanstackRouter({
                routesDirectory: "./app/routes",
                generatedRouteTree: "./app/routeTree.gen.ts",
                // Split each route (and its study data) into its own chunk.
                autoCodeSplitting: true,
            }),
            viteReact(),
            preconnectPocketBase,
            swVersionPlugin(),
            pdfjsAssetsPlugin(),
        ],
        define: {
            APP_VERSION: JSON.stringify(pkg.version),
            // Same sha as `version.json`, so the About page can tell whether
            // the running bundle is the deployed one.
            APP_SHA: JSON.stringify(appSha),
            // `bun run preview` opts in so the local build keeps the dev
            // account shortcuts. Deploys never set it, so the list stays
            // eliminated from their bundles.
            DEV_BUILD: JSON.stringify(process.env.DEV_BUILD === "1"),
        },
    };
});
