/**
 * Final catch-all: the PWA share fallback, unknown `/api/*` JSON 404s and
 * the built SPA static handler.
 *
 * `server/static.ts` is unchanged; this module only adds the API method
 * table and the share-target redirect in front of it.
 */

import { Elysia } from "elysia";

import { HttpError } from "../http/errors";
import { emptyResponse } from "../http/response";
import { createStaticHandler } from "../static";

export type StaticFallbackDeps = {
    /** Built SPA directory; omitted in unit tests. */
    staticDir?: string;
};

/** Paths with a dedicated route, so a wrong method is 405, not 404. */
const API_METHODS: Record<string, readonly string[]> = {
    "/api/health": ["GET", "HEAD"],
    "/api/ai/health": ["GET", "HEAD"],
    "/api/ai/models": ["GET", "HEAD"],
    "/api/ai/geo/ip": ["GET", "HEAD"],
    "/api/ai/sandbox": ["POST"],
    "/api/ai/tools/expenses": ["POST"],
    "/api/ai/tools/posts": ["POST"],
    "/api/ai/tools/comments": ["POST"],
    "/api/ai/tools/memory": ["POST"],
    "/api/ai/tools/url": ["POST"],
    "/api/ai/chat/completions": ["POST"],
    "/api/ai/opencode/v1/chat/completions": ["POST"],
    "/api/feedback/report": ["POST"],
    "/api/feedback/upload": ["POST"],
    "/api/feedback/issue-state": ["POST"],
    "/api/video/compress": ["POST"],
};

export function staticFallback(deps: StaticFallbackDeps) {
    const serveStatic = deps.staticDir
        ? createStaticHandler(deps.staticDir)
        : null;

    return new Elysia({ name: "static" }).all("/*", async ({ request }) => {
        const url = new URL(request.url);

        // Web Share Target POSTs are answered by the service worker. Reaching
        // the server means the installed PWA still runs an older worker, and
        // the shared file cannot be recovered here — send the user back with
        // an explanation instead of the static handler's bare 405.
        if (request.method === "POST" && url.pathname === "/share") {
            return emptyResponse(request, 303, {
                Location: "/share?stale=1",
            });
        }

        if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
            const allowed = API_METHODS[url.pathname];
            if (allowed && !allowed.includes(request.method)) {
                throw new HttpError(405, "method not allowed", {
                    code: "method_not_allowed",
                    headers: { Allow: allowed.join(", ") },
                });
            }
            throw new HttpError(404, "not found", { code: "not_found" });
        }

        if (!serveStatic) {
            throw new HttpError(404, "not found", { code: "not_found" });
        }
        return serveStatic(request, url);
    });
}
