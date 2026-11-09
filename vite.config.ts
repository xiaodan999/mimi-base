// vite.config.ts

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, loadEnv, type Plugin } from "vite";

// `process.env.npm_package_version` is undefined outside an npm/bun script,
// so read the version straight from package.json instead. `require` keeps this
// an ESM-safe read that also works when the config is bundled by Vite itself.
const require = createRequire(import.meta.url);
const pkg = require("./package.json") as { version: string };

/**
 * Full commit sha this bundle was built from. CI exports GITHUB_SHA (== the
 * `github.sha` the deploy workflow sends as `x-spa-sha`); local builds fall
 * back to `git rev-parse HEAD`. It is written verbatim into `build/version.json`
 * so the post-deploy check can assert the *new* bundle is the one being served.
 */
function resolveAppSha(): string {
    const fromEnv =
        process.env.GITHUB_SHA ||
        process.env.GIT_SHA ||
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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    // VITE_PORT may come from the shell or this worktree's `.env`, which is
    // handy when another checkout already owns :3000.
    const env = loadEnv(mode, process.cwd(), "");
    const port = Number(env.VITE_PORT) || 3000;

    // Dev serves the app through the same origin as PocketBase's API, so a
    // phone on the LAN only needs this one port. `dev:all` sets PB_PORT; plain
    // `bun run dev` falls back to the default PocketBase port.
    const pocketBasePort = Number(process.env.PB_PORT ?? env.PB_PORT) || 8090;

    // The Bun supervisor serves the streaming AI relay next to the deploy
    // endpoints. `dev:all` picks a free port per worktree.
    const supervisorPort =
        Number(process.env.SUPERVISOR_PORT ?? env.SUPERVISOR_PORT) || 9001;

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
                // Pairs with VITE_POCKETBASE_URL=same-origin in dev.
                "/api": {
                    target: `http://127.0.0.1:${pocketBasePort}`,
                    ws: true,
                },
                // Streaming AI relay (Bun supervisor), same-origin in dev.
                // xfwd forwards the phone's address so /ai/geo/ip can tell
                // the Vite proxy hop from the actual caller.
                "/ai": {
                    target: `http://127.0.0.1:${supervisorPort}`,
                    xfwd: true,
                },
                // Bug-report -> GitHub issue endpoint (Bun supervisor). Only
                // the API path is proxied: `/feedback` itself is a client
                // route and must keep the SPA history fallback. Production
                // must route `/feedback/report` to the supervisor port (see
                // AGENTS.md).
                "/feedback/report": {
                    target: `http://127.0.0.1:${supervisorPort}`,
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
            tanstackRouter({
                routesDirectory: "./app/routes",
                generatedRouteTree: "./app/routeTree.gen.ts",
                // Split each route (and its study data) into its own chunk.
                autoCodeSplitting: true,
            }),
            viteReact(),
            preconnectPocketBase,
            swVersionPlugin(),
            // Keep the 1.2 MB report out of `build/`; it used to be deployed
            // publicly at /stats.html. It now lands in the gitignored tmp/.
            visualizer({
                emitFile: false,
                filename: "tmp/stats.html",
                template: "treemap",
            }),
        ],
        define: {
            APP_VERSION: JSON.stringify(pkg.version),
            // Same sha as `version.json` / `x-spa-sha`, so the About page can
            // tell whether the running bundle is the deployed one.
            APP_SHA: JSON.stringify(appSha),
        },
    };
});
