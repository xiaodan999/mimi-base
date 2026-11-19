import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");

function read(relative: string): string {
    return readFileSync(path.join(root, relative), "utf8");
}

/** Docs and source that describe the current deployment, not its history. */
const CURRENT_FILES = [
    "AGENTS.md",
    "README.md",
    "SECURITY.md",
    ".env.example",
    "docker/README.md",
    "docker/.env.app.example",
    ".github/workflows/ci.yml",
    ".github/workflows/images.yml",
    "vite.config.ts",
    "server/ai-relay.ts",
    "server/config.ts",
    "server/feedback.ts",
    "server/video.ts",
    "pocketbase/pb_hooks/dev_seed.pb.js",
];

/** Names from the retired deploy workflow and env layout. */
const REMOVED = ["x-spa-sha", "deploy-db", "deploy-spa", ".env.prod"];

describe("docs facts", () => {
    test("current docs do not mention removed deploy machinery", () => {
        const hits = CURRENT_FILES.flatMap((file) =>
            REMOVED.filter((needle) => read(file).includes(needle)).map(
                (needle) => `${file}: ${needle}`,
            ),
        );
        expect(hits).toEqual([]);
    });

    test("install:server installs the server workspace", () => {
        const pkg = JSON.parse(read("package.json")) as {
            scripts: Record<string, string>;
        };
        expect(pkg.scripts["install:server"]).toContain("server");
    });
});
