// vite.config.ts

import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
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
                    // Rolldown requires a function here, not a package map.
                    manualChunks(id) {
                        if (id.includes("node_modules/react/")) {
                            return "common/react-packages";
                        }
                        if (id.includes("node_modules/react-dom/")) {
                            return "common/react-packages";
                        }
                        if (id.includes("node_modules/@tanstack/react-query")) {
                            return "common/react-query";
                        }
                        if (
                            id.includes("node_modules/@tanstack/react-router")
                        ) {
                            return "common/tanstack-router";
                        }
                        return undefined;
                    },
                },
            },
        },
        plugins: [
            TanStackRouterVite({
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
