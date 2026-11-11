/**
 * Server configuration, read once from the environment.
 *
 * There is no `.env.prod` probing here: the container or the dev script
 * supplies every value. `MIMI_DEV=1` is the only mode switch (it enables the
 * dev geo fallback and the seeded superuser defaults in `scripts/backends.ts`,
 * which passes the same var to PocketBase for `dev_seed.pb.js`).
 */

import path from "node:path";

function text(key: string, fallback = ""): string {
    const value = process.env[key]?.trim();
    return value || fallback;
}

function integer(key: string, fallback: number): number {
    const raw = process.env[key];
    if (raw === undefined || raw.trim() === "") return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

export const isDev = process.env.MIMI_DEV === "1";

const pbUrl = text("PB_URL", "http://127.0.0.1:8090").replace(/\/+$/, "");

export const config = {
    port: integer("PORT", 9001),
    host: text("HOST", "0.0.0.0"),
    /** PocketBase origin (no `/db` suffix), e.g. http://mimi-pb:8090 */
    pbUrl,
    /** Built SPA directory. */
    staticDir: path.resolve(
        text("STATIC_DIR", path.join(import.meta.dir, "../build")),
    ),
    ai: {
        apiKey: text("OPENCODE_API_KEY"),
        model: text("OPENCODE_MODEL", "deepseek-v4.1-flash"),
        chatModels: text("OPENCODE_CHAT_MODELS"),
        defaultChatModel: text("OPENCODE_CHAT_MODEL_DEFAULT"),
        dailyLimit: integer("AI_DAILY_REQUESTS_PER_USER", 100),
    },
    feedback: {
        githubToken: text("GITHUB_TOKEN"),
        githubRepo: text("GITHUB_REPO"),
        githubApiUrl: text("GITHUB_API_URL"),
        githubUploadsUrl: text("GITHUB_UPLOADS_URL"),
    },
    superuser: {
        email: text("SUPERUSER_EMAIL", isDev ? "dev@mimi.local" : ""),
        password: text("SUPERUSER_PASSWORD", isDev ? "mimi123456" : ""),
    },
    ffmpegPath: text("FFMPEG_PATH"),
} as const;
