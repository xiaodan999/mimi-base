/**
 * Response helpers shared by every route.
 *
 * They centralize the request id and CORS headers so a 401 from the root
 * guard, a handler error and a normal JSON reply look the same on the wire.
 */

import { applyCors } from "./cors";
import { applyRequestId } from "./request-id";

export type JsonInit = {
    status?: number;
    headers?: Record<string, string>;
};

export function jsonResponse(
    request: Request,
    body: unknown,
    init: JsonInit = {},
): Response {
    const pathname = new URL(request.url).pathname;
    const headers = new Headers({
        "content-type": "application/json; charset=utf-8",
    });
    applyCors(pathname, headers);
    applyRequestId(request, headers);
    for (const [key, value] of Object.entries(init.headers ?? {})) {
        headers.set(key, value);
    }
    return new Response(JSON.stringify(body), {
        status: init.status ?? 200,
        headers,
    });
}

export function emptyResponse(
    request: Request,
    status: number,
    headers: Record<string, string> = {},
): Response {
    const pathname = new URL(request.url).pathname;
    const merged = new Headers();
    applyCors(pathname, merged);
    applyRequestId(request, merged);
    for (const [key, value] of Object.entries(headers)) {
        merged.set(key, value);
    }
    return new Response(null, { status, headers: merged });
}

export function streamResponse(
    request: Request,
    body: ReadableStream<Uint8Array>,
    init: JsonInit & { contentType?: string } = {},
): Response {
    const pathname = new URL(request.url).pathname;
    const headers = new Headers({
        "content-type": init.contentType ?? "application/octet-stream",
    });
    applyCors(pathname, headers);
    applyRequestId(request, headers);
    for (const [key, value] of Object.entries(init.headers ?? {})) {
        headers.set(key, value);
    }
    return new Response(body, { status: init.status ?? 200, headers });
}

/** Binary body (compressed video) with the same header plumbing. */
export function bytesResponse(
    request: Request,
    body: Uint8Array,
    init: JsonInit & { contentType?: string } = {},
): Response {
    const pathname = new URL(request.url).pathname;
    const headers = new Headers({
        "content-type": init.contentType ?? "application/octet-stream",
        "content-length": String(body.byteLength),
    });
    applyCors(pathname, headers);
    applyRequestId(request, headers);
    for (const [key, value] of Object.entries(init.headers ?? {})) {
        headers.set(key, value);
    }
    return new Response(body as unknown as BodyInit, {
        status: init.status ?? 200,
        headers,
    });
}
