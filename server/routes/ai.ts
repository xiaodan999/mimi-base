/**
 * `/api/ai/*` routes.
 *
 * The root guard has already authenticated these requests and the root
 * `onParse` hook owns the body cap, so each handler just calls the relay.
 */

import { Elysia } from "elysia";

import type { AiRelay } from "../ai/relay";
import { getRequestAuth, requireAuth } from "../http/auth";
import { getRequestIp } from "../http/request-ip";
import { jsonResponse } from "../http/response";

export const AI_CHAT_PATH = "/api/ai/opencode/v1/chat/completions";
/** General chat entry point: honours the server allowlist instead of forcing one model. */
export const AI_CHAT_COMPLETIONS_PATH = "/api/ai/chat/completions";
export const AI_MODELS_PATH = "/api/ai/models";
export const AI_SANDBOX_PATH = "/api/ai/sandbox";
export const AI_HEALTH_PATH = "/api/ai/health";
/** Chat location feature: caller IP -> city estimate (see geo-ip.ts). */
export const AI_GEO_IP_PATH = "/api/ai/geo/ip";

export function aiRoutes(ai: AiRelay) {
    const app = new Elysia({ name: "ai" });

    app.get("/api/ai/models", ({ request }) => {
        requireAuth(getRequestAuth(request));
        return jsonResponse(request, ai.models());
    });

    app.get("/api/ai/geo/ip", ({ request }) => {
        const auth = requireAuth(getRequestAuth(request));
        return ai.geo(request, auth, getRequestIp(request));
    });

    app.post("/api/ai/sandbox", ({ request, body }) => {
        const auth = requireAuth(getRequestAuth(request));
        return ai.sandbox(request, auth, body);
    });

    for (const path of [
        "/api/ai/tools/expenses",
        "/api/ai/tools/posts",
        "/api/ai/tools/comments",
        "/api/ai/tools/memory",
        "/api/ai/tools/url",
    ]) {
        app.post(path, ({ request, body }) => {
            const auth = requireAuth(getRequestAuth(request));
            return ai.tools(request, auth, path, body);
        });
    }

    app.post("/api/ai/chat/completions", ({ request, body }) => {
        const auth = requireAuth(getRequestAuth(request));
        return ai.chat(request, auth, body, "chat");
    });

    app.post("/api/ai/opencode/v1/chat/completions", ({ request, body }) => {
        const auth = requireAuth(getRequestAuth(request));
        return ai.chat(request, auth, body, "legacy");
    });

    return app;
}
