/**
 * CORS for the three browser-facing API services.
 *
 * The services run on a different origin during local dev (Vite proxies, but
 * Vercel and the split deployment can call cross-origin), so every response —
 * including errors — must carry the matching `Access-Control-*` headers.
 */

const AI_PREFIX = "/api/ai";
const FEEDBACK_PREFIX = "/api/feedback";
const VIDEO_PREFIX = "/api/video";

const AI_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
        "Authorization, Content-Type, x-opencode-session, x-client",
    "Access-Control-Max-Age": "600",
};

const FEEDBACK_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
};

const VIDEO_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Expose-Headers": "X-Video-Compressed",
    "Access-Control-Max-Age": "600",
};

function matches(prefix: string, pathname: string): boolean {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** CORS headers for a path, or null when it is not a browser API route. */
export function corsHeadersFor(
    pathname: string,
): Record<string, string> | null {
    if (matches(AI_PREFIX, pathname)) return AI_HEADERS;
    if (matches(FEEDBACK_PREFIX, pathname)) return FEEDBACK_HEADERS;
    if (matches(VIDEO_PREFIX, pathname)) return VIDEO_HEADERS;
    return null;
}

export function applyCors(pathname: string, headers: Headers): void {
    const cors = corsHeadersFor(pathname);
    if (!cors) return;
    for (const [key, value] of Object.entries(cors)) {
        headers.set(key, value);
    }
}

/** 204 for a preflight request, or null when the path is not ours. */
export function preflightResponse(pathname: string): Response | null {
    const cors = corsHeadersFor(pathname);
    if (!cors) return null;
    return new Response(null, { status: 204, headers: cors });
}

/** Clone a response with the CORS headers for its path merged in. */
export function withCors(pathname: string, response: Response): Response {
    if (!corsHeadersFor(pathname)) return response;
    const headers = new Headers(response.headers);
    applyCors(pathname, headers);
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}
