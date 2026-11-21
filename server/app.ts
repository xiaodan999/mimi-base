/**
 * Elysia application factory.
 *
 * The root lifecycle owns the cross-cutting contract:
 *   - `onRequest`: request id, CORS preflight, and bearer auth for the API
 *     prefixes *before* any body is read.
 *   - `onParse`: the cap table and JSON/FormData parsing (`server/http/body`).
 *   - `derive`: exposes the authenticated caller as `ctx.auth`.
 *   - `onError`: one error envelope for every 4xx/5xx.
 *
 * Feature modules only see an authenticated request plus its parsed body.
 */

import { Elysia } from "elysia";

import { type AiRelayDeps, createAiRelay } from "./ai/relay";
import { createFeedbackService } from "./feedback/service";
import type { FeedbackDeps } from "./feedback/types";
import {
    authFailureResponse,
    createAuthenticator,
    getRequestAuth,
    requiresAuth,
} from "./http/auth";
import { parseRequestBody } from "./http/body";
import { preflightResponse } from "./http/cors";
import { mapError } from "./http/errors";
import { type Logger, logger } from "./http/logger";
import { withRequestId } from "./http/request-id";
import { aiRoutes } from "./routes/ai";
import { feedbackRoutes } from "./routes/feedback";
import { healthRoutes } from "./routes/health";
import { staticFallback } from "./routes/static";
import { videoRoutes } from "./routes/video";
import { createVideoService, type VideoCompressDeps } from "./video";

export type AppDeps = {
    /** PocketBase origin (no `/db` suffix); shared by auth and the services. */
    pbBaseUrl?: string;
    ai?: AiRelayDeps;
    feedback?: FeedbackDeps;
    video?: VideoCompressDeps;
    /** Built SPA directory; omitted in unit tests. */
    staticDir?: string;
    /** Shared auth/upstream fetch override (tests). */
    fetch?: typeof fetch;
    now?: () => number;
    authCacheMs?: number;
    logger?: Logger;
};

function resolvePbBaseUrl(deps: AppDeps): string {
    return (
        deps.pbBaseUrl ?? deps.ai?.pbBaseUrl ?? deps.feedback?.pbBaseUrl ?? ""
    );
}

export function createApp(deps: AppDeps = {}) {
    const log = deps.logger ?? logger;
    const pbBaseUrl = resolvePbBaseUrl(deps);
    const fetchImpl =
        deps.fetch ?? deps.ai?.fetch ?? deps.feedback?.fetch ?? fetch;
    const now = deps.now ?? deps.ai?.now ?? deps.feedback?.now ?? Date.now;
    const authenticate = createAuthenticator({
        pbBaseUrl,
        fetch: fetchImpl,
        now,
        ...(deps.authCacheMs ? { cacheMs: deps.authCacheMs } : {}),
    });

    const ai = deps.ai ? createAiRelay(deps.ai) : null;
    const feedback = deps.feedback
        ? createFeedbackService(deps.feedback)
        : null;
    const video = deps.video ? createVideoService(deps.video) : null;

    return new Elysia()
        .onRequest(async ({ request }) => {
            const url = new URL(request.url);
            if (request.method === "OPTIONS") {
                const preflight = preflightResponse(url.pathname);
                if (preflight) return withRequestId(request, preflight);
                return undefined;
            }
            if (!requiresAuth(url.pathname)) return undefined;
            const result = await authenticate(request);
            if (result.ok) return undefined;
            return authFailureResponse(request, result);
        })
        .onParse(({ request }) => parseRequestBody(request))
        .derive(({ request }) => ({
            auth: getRequestAuth(request) ?? null,
        }))
        .onError(({ request, error, code }) =>
            mapError({ request, error, code, logger: log }),
        )
        .use(
            healthRoutes({
                pbUrl: pbBaseUrl,
                ...(ai ? { ai } : {}),
            }),
        )
        .use(ai ? aiRoutes(ai) : new Elysia({ name: "ai-disabled" }))
        .use(
            feedback
                ? feedbackRoutes(feedback)
                : new Elysia({ name: "feedback-disabled" }),
        )
        .use(
            video ? videoRoutes(video) : new Elysia({ name: "video-disabled" }),
        )
        .use(staticFallback({ staticDir: deps.staticDir }));
}
