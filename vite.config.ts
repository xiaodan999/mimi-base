// vite.config.ts

import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    // VITE_PORT may come from the shell or this worktree's `.env`, which is
    // handy when another checkout already owns :3000.
    const env = loadEnv(mode, process.cwd(), "");
    const port = Number(env.VITE_PORT) || 3000;

    return {
        server: {
            port,
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
            // put it the last one
            visualizer({
                emitFile: true,
                template: "treemap",
            }),
        ],
        define: {
            APP_VERSION: JSON.stringify(process.env.npm_package_version),
        },
    };
});
