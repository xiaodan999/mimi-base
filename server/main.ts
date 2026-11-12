/**
 * mimi-base API container entrypoint.
 *
 * Serves `/api/*` (AI relay, data tools, feedback, video compression) and the
 * built SPA. PocketBase is a separate container behind Caddy's `/db/*`
 * route; this process only talks to it over HTTP via `PB_URL`.
 */

import { createAiRelay } from "./ai-relay";
import { resolveChatModels } from "./chat-models";
import { config, isDev } from "./config";
import { createFeedbackService } from "./feedback";
import { createIpCityLookup } from "./geo-ip";
import { createSandboxService } from "./sandbox";
import { createStaticHandler } from "./static";
import { createVideoService } from "./video";

const sandbox = createSandboxService();
await sandbox.ensure();

const aiRelay = createAiRelay({
    pbBaseUrl: config.pbUrl,
    apiKey: config.ai.apiKey,
    model: config.ai.model,
    chatModels: resolveChatModels(config.ai.chatModels),
    defaultChatModel: config.ai.defaultChatModel || undefined,
    dailyLimit: config.ai.dailyLimit,
    sandbox,
    // Dev shares one home network, so private/loopback callers (Vite proxy,
    // localhost) may fall back to this machine's egress IP.
    geoLookup: createIpCityLookup({ devEgress: isDev }),
});

const feedback = createFeedbackService({
    pbBaseUrl: config.pbUrl,
    githubToken: config.feedback.githubToken,
    githubRepo: config.feedback.githubRepo,
    githubApiUrl: config.feedback.githubApiUrl || undefined,
    githubUploadsUrl: config.feedback.githubUploadsUrl || undefined,
    pbAdminEmail: config.superuser.email,
    pbAdminPassword: config.superuser.password,
});

const video = createVideoService({
    pbBaseUrl: config.pbUrl,
    ffmpegPath: config.ffmpegPath || undefined,
});

const serveStatic = createStaticHandler(config.staticDir);

const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    // Bun defaults to 10s. SSE can pause longer between chunks, and video
    // compression can run for minutes before the response starts.
    idleTimeout: 255,
    async fetch(req, srv) {
        const url = new URL(req.url);

        const ai = await aiRelay(req, srv.requestIP(req)?.address ?? "");
        if (ai) return ai;

        const report = await feedback(req);
        if (report) return report;

        const compressedVideo = await video(req);
        if (compressedVideo) return compressedVideo;

        if (url.pathname === "/api/health") {
            return Response.json({ ok: true, pb: config.pbUrl });
        }
        if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
            return Response.json(
                { error: { message: "not found" } },
                { status: 404 },
            );
        }

        // Web Share Target POSTs are answered by the service worker. Reaching
        // the server means the installed PWA still runs an older worker, and
        // the shared file cannot be recovered here — send the user back with
        // an explanation instead of the static handler's bare 405.
        if (req.method === "POST" && url.pathname === "/share") {
            return new Response(null, {
                status: 303,
                headers: { Location: "/share?stale=1" },
            });
        }

        return serveStatic(req, url);
    },
});

console.log(
    `mimi api listening on ${config.host}:${server.port} ` +
        `(pb ${config.pbUrl}; AI key ${
            config.ai.apiKey ? "configured" : "missing"
        }; static ${config.staticDir})`,
);

function shutdown() {
    void server.stop();
    process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
