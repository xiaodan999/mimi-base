/**
 * Per-request correlation id.
 *
 * The browser/proxy may send `x-request-id`; only a conservative token is
 * accepted, otherwise a UUID is generated. The id is kept in a WeakMap so
 * hooks, route handlers and the error envelope share one value without
 * threading it through Elysia's context.
 */

const REQUEST_ID_HEADER = "x-request-id";
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

const requestIds = new WeakMap<Request, string>();

export function getRequestId(request: Request): string {
    const cached = requestIds.get(request);
    if (cached) return cached;
    const supplied = request.headers.get(REQUEST_ID_HEADER)?.trim() ?? "";
    const id = VALID_REQUEST_ID.test(supplied) ? supplied : crypto.randomUUID();
    requestIds.set(request, id);
    return id;
}

/** Copy the id onto a header bag (usually a Response). */
export function applyRequestId(request: Request, headers: Headers): void {
    headers.set(REQUEST_ID_HEADER, getRequestId(request));
}

/** Clone a response with the request id header added. */
export function withRequestId(request: Request, response: Response): Response {
    const headers = new Headers(response.headers);
    applyRequestId(request, headers);
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}
