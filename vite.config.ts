import path from "path";

import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: "build",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-packages": ["react", "react-dom", "react-router-dom"],
          "supabase-js": ["@supabase/supabase-js"],
          "react-query": ["@tanstack/react-query"],
        },
      },
    },
  },
  plugins: [
    react(),
    // put it the last one
    visualizer({
      emitFile: true,
      template: "treemap",
    }),
  ],
  resolve: {
    alias: {
      "@src": path.resolve(__dirname, "src"),
    },
  },
});
