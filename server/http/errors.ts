/**
 * One error contract for the whole API.
 *
 * 4xx responses are `{ error: { message, code?, requestId? } }` (optionally
 * with extra top-level details a client already understands, e.g. the
 * feedback `reason`). 5xx never expose a stack: the detail goes to the log
 * with the request id, the caller gets a generic message plus that id.
 */

import type { ApiErrorBody } from "../../lib/contracts/api";
import { type Logger, logger as baseLogger } from "./logger";
import { getRequestId } from "./request-id";
import { jsonResponse } from "./response";

export type HttpErrorOptions = {
    code?: string;
    /** Extra top-level fields merged into the error body. */
    details?: Record<string, unknown>;
    headers?: Record<string, string>;
};

export class HttpError extends Error {
    readonly status: number;
    readonly code?: string;
    readonly details?: Record<string, unknown>;
    readonly headers?: Record<string, string>;

    constructor(
        status: number,
        message: string,
        options: HttpErrorOptions = {},
    ) {
        super(message);
        this.name = "HttpError";
        this.status = status;
        this.code = options.code;
        this.details = options.details;
        this.headers = options.headers;
    }
}

export function errorBody(
    request: Request,
    message: string,
    code?: string,
    details?: Record<string, unknown>,
): ApiErrorBody & Record<string, unknown> {
    return {
        error: {
            message,
            ...(code ? { code } : {}),
            requestId: getRequestId(request),
        },
        ...(details ?? {}),
    };
}

function unwrapParseError(error: unknown): unknown {
    if (
        error instanceof Error &&
        error.name === "Error" &&
        "cause" in error &&
        error.cause
    ) {
        return error.cause;
    }
    return error;
}

export type ErrorMapping = {
    request: Request;
    error: unknown;
    code?: string | number;
    logger?: Logger;
};

/**
 * Map anything thrown by Elysia or a handler to a Response.
 *
 * `code` is Elysia's lifecycle code (PARSE, VALIDATION, NOT_FOUND, …).
 */
export function mapError({
    request,
    error,
    code,
    logger,
}: ErrorMapping): Response {
    const log = logger ?? baseLogger;

    const real = code === "PARSE" ? unwrapParseError(error) : error;
    if (real instanceof HttpError) {
        return jsonResponse(
            request,
            errorBody(request, real.message, real.code, real.details),
            {
                status: real.status,
                headers: real.headers,
            },
        );
    }

    if (code === "VALIDATION") {
        return jsonResponse(
            request,
            errorBody(request, "请求参数不正确", "validation_error"),
            { status: 400 },
        );
    }
    if (code === "PARSE") {
        return jsonResponse(
            request,
            errorBody(request, "请求内容不是合法的 JSON", "invalid_body"),
            { status: 400 },
        );
    }
    if (code === "NOT_FOUND") {
        return jsonResponse(
            request,
            errorBody(request, "not found", "not_found"),
            { status: 404 },
        );
    }

    log.error("unhandled request error", {
        requestId: getRequestId(request),
        path: new URL(request.url).pathname,
        error:
            error instanceof Error
                ? (error.stack ?? error.message)
                : String(error),
    });
    return jsonResponse(
        request,
        errorBody(request, "服务器内部错误，稍后再试", "internal_error"),
        { status: 500 },
    );
}
