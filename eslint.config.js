import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: [
            "app/routeTree.gen.ts",
            "components/ui/**",
            "build/**",
            "tmp/**",
            "pb_data_snapshots/**",
            // Service worker and PocketBase JSVM scripts run outside the app.
            "public/sw.js",
            "pocketbase/**",
            // CommonJS tooling config
            "tailwind.config.js",
            "postcss.config.js",
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    react.configs.flat.recommended,
    importPlugin.flatConfigs.recommended,
    {
        plugins: {
            "react-hooks": reactHooks,
        },
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                Bun: "readonly",
            },
            parserOptions: {
                ecmaFeatures: { jsx: true },
            },
        },
        settings: {
            react: { version: "detect" },
            "import/resolver": {
                typescript: true,
                node: true,
            },
        },
        rules: {
            "react/react-in-jsx-scope": "off",
            "react/prop-types": "off",
            // Keep the classic hook checks; the new compiler rules flag
            // existing patterns that are intentional here.
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",
            // TypeScript already reports unresolved imports.
            "import/no-unresolved": "off",
            "import/order": [
                "error",
                {
                    groups: ["builtin", "external", "internal", "index"],
                    "newlines-between": "always",
                    pathGroups: [
                        {
                            pattern: "react",
                            group: "external",
                            position: "before",
                        },
                        {
                            pattern: "@tanstack",
                            group: "external",
                            position: "before",
                        },
                    ],
                    distinctGroup: false,
                    pathGroupsExcludedImportTypes: ["react", "@tanstack"],
                    alphabetize: { order: "asc" },
                },
            ],
        },
    },
);
