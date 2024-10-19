// vite.config.ts

import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

// https://vitejs.dev/config/
export default defineConfig({
	build: {
		outDir: "build",
		sourcemap: false,
		rollupOptions: {
			output: {
				manualChunks: {
					"common/react-packages": ["react", "react-dom", "react-router-dom"],
					"common/supabase-js": ["@supabase/supabase-js"],
					"common/react-query": ["@tanstack/react-query"],
					"common/tanstack-router": ["@tanstack/react-router"],
				},
			},
		},
	},
	plugins: [
		TanStackRouterVite({
			routesDirectory: "./app/routes",
			generatedRouteTree: "./app/routeTree.gen.ts",
		}),
		viteReact(),
		// this is the plugin that enables path aliases
		viteTsConfigPaths({
			projects: ["./tsconfig.json"],
		}),
		// put it the last one
		visualizer({
			emitFile: true,
			template: "treemap",
		}),
	],
});
