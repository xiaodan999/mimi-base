/**
 * mimi-base API container entrypoint.
 *
 * Composition only: build the Elysia app, start Bun's HTTP server and hand
 * each request's socket address to the app. `/api/*` (AI relay, data tools,
 * feedback, video compression) and the built SPA are served here; PocketBase
 * is a separate container behind Caddy's `/db/*` route, reached over HTTP via
 * `PB_URL`.
 */

import { resolveChatModels } from "./ai/models";
import { createSandboxService } from "./ai/sandbox/sandbox";
import { createApp } from "./app";
import { config, isDev } from "./config";
import { createIpCityLookup } from "./geo-ip";
import { logger } from "./http/logger";
import { setRequestIp } from "./http/request-ip";

const sandbox = createSandboxService();
await sandbox.ensure();

const app = createApp({
    pbBaseUrl: config.pbUrl,
    ai: {
        pbBaseUrl: config.pbUrl,
        apiKey: config.ai.apiKey,
        apiUrl: config.ai.apiUrl,
        model: config.ai.model,
        chatModels: resolveChatModels(config.ai.chatModels),
        defaultChatModel: config.ai.defaultChatModel || undefined,
        dailyLimit: config.ai.dailyLimit,
        sandbox,
        // Dev shares one home network, so private/loopback callers (Vite
        // proxy, localhost) may fall back to this machine's egress IP.
        geoLookup: createIpCityLookup({ devEgress: isDev }),
    },
    feedback: {
        pbBaseUrl: config.pbUrl,
        githubToken: config.feedback.githubToken,
        githubRepo: config.feedback.githubRepo,
        githubApiUrl: config.feedback.githubApiUrl || undefined,
        githubUploadsUrl: config.feedback.githubUploadsUrl || undefined,
        pbAdminEmail: config.superuser.email,
        pbAdminPassword: config.superuser.password,
    },
    video: {
        ffmpegPath: config.ffmpegPath || undefined,
    },
    staticDir: config.staticDir,
});

const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    // Bun defaults to 10s. SSE can pause longer between chunks, and video
    // compression can run for minutes before the response starts.
    idleTimeout: 255,
    // Never serve Bun's development error page (stack/cwd/source line) from
    // the API container, and keep a hard ceiling above the largest legitimate
    // body (50 MB video + multipart overhead).
    development: false,
    maxRequestBodySize: 64 * 1024 * 1024,
    fetch(request, srv) {
        setRequestIp(request, srv.requestIP(request)?.address ?? "");
        return app.fetch(request);
    },
});

logger.info("mimi api listening", {
    address: `${config.host}:${server.port}`,
    pb: config.pbUrl,
    aiKey: config.ai.apiKey ? "configured" : "missing",
    static: config.staticDir,
});

function shutdown(): void {
    void server.stop();
    process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
