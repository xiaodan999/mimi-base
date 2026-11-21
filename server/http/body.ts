/**
 * Path+method body caps and parsing for the API.
 *
 * Elysia's default parser must not read these bodies: the cap has to be
 * enforced while the stream is consumed (`request-body.ts`), before a route
 * buffers a chunked upload into memory. The root `onParse` hook calls
 * `parseRequestBody`; handlers receive the parsed value through Elysia.
 */

import { BodyTooLargeError, readRequestBody } from "../request-body";
import { HttpError } from "./errors";

export type BodyKind = "json" | "form";

export type BodyRule = {
    cap: number;
    kind: BodyKind;
    tooLargeMessage: string;
    invalidMessage: string;
};

const MIB = 1024 * 1024;
const KIB = 1024;

const CHAT_RULE: BodyRule = {
    cap: 16 * MIB,
    kind: "json",
    tooLargeMessage: "请求体过大",
    invalidMessage: "请求体不是合法的 JSON",
};

const SANDBOX_RULE: BodyRule = {
    cap: 1 * MIB,
    kind: "json",
    tooLargeMessage: "请求体过大",
    invalidMessage: "请求体不是合法的 JSON",
};

const TOOLS_RULE: BodyRule = {
    cap: 64 * KIB,
    kind: "json",
    tooLargeMessage: "请求体过大",
    invalidMessage: "请求体不是合法的 JSON",
};

const FEEDBACK_JSON_RULE: BodyRule = {
    cap: 8 * KIB,
    kind: "json",
    tooLargeMessage: "反馈内容太大了",
    invalidMessage: "请求内容不是合法 JSON",
};

/** Three 10 MB files plus multipart overhead. */
const FEEDBACK_UPLOAD_RULE: BodyRule = {
    cap: 3 * 10 * MIB + 256 * KIB,
    kind: "form",
    tooLargeMessage: "附件太大了（最多 3 个，每个 10MB）",
    invalidMessage: "请求内容不是合法的表单",
};

/** 50 MB video plus multipart overhead. */
const VIDEO_RULE: BodyRule = {
    cap: 50 * MIB + 1 * MIB,
    kind: "form",
    tooLargeMessage: "视频不能超过 50MB",
    invalidMessage: "请求内容不是合法的表单",
};

const TOOL_PATHS = new Set([
    "/api/ai/tools/expenses",
    "/api/ai/tools/posts",
    "/api/ai/tools/comments",
    "/api/ai/tools/memory",
    "/api/ai/tools/url",
]);

export function bodyRuleFor(method: string, pathname: string): BodyRule | null {
    if (method.toUpperCase() !== "POST") return null;
    switch (pathname) {
        case "/api/ai/chat/completions":
        case "/api/ai/opencode/v1/chat/completions":
            return CHAT_RULE;
        case "/api/ai/sandbox":
            return SANDBOX_RULE;
        case "/api/feedback/report":
        case "/api/feedback/issue-state":
            return FEEDBACK_JSON_RULE;
        case "/api/feedback/upload":
            return FEEDBACK_UPLOAD_RULE;
        case "/api/video/compress":
            return VIDEO_RULE;
        default:
            return TOOL_PATHS.has(pathname) ? TOOLS_RULE : null;
    }
}

const parsedBodies = new WeakMap<Request, unknown>();

function bytesToFormData(
    bytes: Uint8Array,
    contentType: string,
): Promise<FormData> {
    return new Response(bytes.buffer as ArrayBuffer, {
        headers: contentType ? { "content-type": contentType } : undefined,
    }).formData();
}

/**
 * Read, cap and parse one request body. Throws HttpError (413/400) so the
 * root error handler can answer with the unified envelope.
 */
export async function parseRequestBody(request: Request): Promise<unknown> {
    const rule = bodyRuleFor(request.method, new URL(request.url).pathname);
    if (!rule) return undefined;

    let bytes: Uint8Array;
    try {
        bytes = await readRequestBody(request, rule.cap);
    } catch (error) {
        if (error instanceof BodyTooLargeError) {
            throw new HttpError(413, rule.tooLargeMessage, {
                code: "payload_too_large",
            });
        }
        throw error;
    }

    let body: unknown;
    if (rule.kind === "form") {
        const contentType = request.headers.get("content-type") ?? "";
        try {
            body = await bytesToFormData(bytes, contentType);
        } catch {
            throw new HttpError(400, rule.invalidMessage, {
                code: "invalid_body",
            });
        }
    } else {
        try {
            body = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
        } catch {
            throw new HttpError(400, rule.invalidMessage, {
                code: "invalid_body",
            });
        }
    }
    parsedBodies.set(request, body);
    return body;
}

/** The value the root hook parsed for this request, if any. */
export function getParsedBody(request: Request): unknown {
    return parsedBodies.get(request);
}
