/**
 * Runtime-neutral API error contract shared by the browser and the Bun API.
 *
 * The server answers every 4xx with `{ error: { message, code?, requestId? } }`
 * (5xx uses the same shape). Older clients may still see a bare `message` or
 * a string `error` from a proxy, so the parser accepts those too.
 */

export type ApiErrorBody = {
    error: {
        message: string;
        /** Machine-readable reason, e.g. `github_not_configured`. */
        code?: string;
        /** Correlates the response with a server log line. */
        requestId?: string;
    };
};

export type ApiErrorInfo = {
    message: string;
    code?: string;
    requestId?: string;
};

function record(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

/** Parse an error body; returns null when there is no usable message. */
export function parseApiError(value: unknown): ApiErrorInfo | null {
    const body = record(value);
    if (!body) return null;

    const nested = record(body.error);
    const message =
        text(nested?.message) || text(body.error) || text(body.message);
    if (!message) return null;

    const code = text(nested?.code);
    const requestId = text(nested?.requestId);
    return {
        message,
        ...(code ? { code } : {}),
        ...(requestId ? { requestId } : {}),
    };
}

/** Convenience for callers that only need the human-readable text. */
export function apiErrorMessage(value: unknown): string {
    return parseApiError(value)?.message ?? "";
}
