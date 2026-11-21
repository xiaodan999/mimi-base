/**
 * Health endpoints. `/api/health` is the container liveness probe; the AI
 * health endpoint stays public so the client can tell "key missing" from
 * "service down" without a token.
 */

import { Elysia } from "elysia";

import type { AiRelay } from "../ai/relay";
import { HttpError } from "../http/errors";
import { jsonResponse } from "../http/response";

export type HealthDeps = {
    pbUrl: string;
    ai?: AiRelay;
};

export function healthRoutes(deps: HealthDeps) {
    return new Elysia({ name: "health" })
        .get("/api/health", ({ request }) =>
            jsonResponse(request, { ok: true, pb: deps.pbUrl }),
        )
        .get("/api/ai/health", ({ request }) => {
            if (!deps.ai) {
                throw new HttpError(503, "AI 服务正在启动，稍后再试", {
                    code: "service_unavailable",
                });
            }
            return jsonResponse(request, deps.ai.health());
        });
}
