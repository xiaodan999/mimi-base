/**
 * Streaming relay for the site's OpenCode Go key.
 *
 * The browser never sees an API key: the root guard authenticates the caller
 * with its PocketBase token, and this module forwards the OpenAI-compatible
 * request to the configured upstream (OpenCode Go by default) with the server
 * key. The upstream body is piped back as a ReadableStream, so SSE reaches
 * the client token by token.
 *
 * This module is transport-only: auth, body caps and CORS live in
 * `server/http/*` and the routes in `server/routes/ai.ts`. The relay is
 * stateless apart from in-memory rate limits and the tools service. The key is
 * never logged or returned to the client.
 */

import type {
    SandboxRequest,
    SandboxResponse,
} from "../../lib/sandbox-protocol";
import {
    createIpCityLookup,
    type IpCityLookup,
    resolveClientIp,
} from "../geo-ip";
import type { AuthUser } from "../http/auth";
import { applyCors } from "../http/cors";
import { HttpError } from "../http/errors";
import { logger } from "../http/logger";
import {
    createDailyQuota,
    createMemoryCounterStore,
    createWindowLimiter,
    type Limiter,
} from "../http/rate-limit";
import { applyRequestId } from "../http/request-id";
import { jsonResponse } from "../http/response";
import {
    type ChatModelInfo,
    findChatModel,
    hasImagePart,
    normalizeModelId,
    normalizeThinkingLevel,
    pickDefaultChatModel,
    resolveChatModels,
} from "./models";
import { type AiToolsService, createAiToolsService } from "./tools";

const DEFAULT_API_URL = "https://opencode.ai/zen/go/v1";
/**
 * Data-URL page images in the history and in read_attachment bursts are the
 * payload driver; 4MB 413-ed long PDF chats. Tool results and attachments
 * stay capped in lib/chat-files.ts, so this is headroom, not a license.
 */
const MAX_BODY_BYTES = 16 * 1024 * 1024;
/** Tool calls carry whole files in their arguments; 4k truncated them. */
const MAX_OUTPUT_TOKENS = 8192;
const SANDBOX_DAILY_LIMIT = 200;
const SANDBOX_MAX_IN_FLIGHT = 4;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
/** Data tools (expenses/posts/memory/url) get their own, looser limits. */
const TOOLS_RATE_MAX = 30;
const TOOLS_DAILY_LIMIT = 200;
const CONNECT_TIMEOUT_MS = 30_000;

const CHAT_RATE_MESSAGE = "请求太频繁了，歇一会儿再试";
const CHAT_DAILY_MESSAGE = "今天的 AI 次数用完了，明天再试";
const TOOLS_RATE_MESSAGE = "工具请求太频繁了，歇一会儿再试";
const TOOLS_DAILY_MESSAGE = "今天的工具次数用完了，明天再试";
const SANDBOX_DAILY_MESSAGE = "今天的沙箱次数用完了，明天再试";
const SANDBOX_BUSY_MESSAGE = "沙箱正忙，稍后再试";

export type SandboxService = {
    run: (request: SandboxRequest) => Promise<SandboxResponse>;
    available: () => boolean;
};

export type AiRelayDeps = {
    /** PocketBase base URL (loopback in dev, mimi-pb in compose). */
    pbBaseUrl: string;
    /** Server-held OpenCode Go key. Empty disables chat (health stays up). */
    apiKey: string;
    /** Model forced on every legacy request (`/api/ai/opencode/v1/...`). */
    model: string;
    /**
     * Models the general chat may pick from. Omit to use the built-in
     * catalog; `model` only selects the default when it is in the list.
     */
    chatModels?: ChatModelInfo[];
    /** Chat model used when a request leaves `model` empty. */
    defaultChatModel?: string;
    /** Per-user daily request cap for the shared key; 0 = unlimited. */
    dailyLimit: number;
    /** Server-side code sandbox; omitted in focused tests. */
    sandbox?: SandboxService;
    /**
     * IP -> city resolver for /api/ai/geo/ip. Built on first use (without the
     * dev egress fallback) when omitted; `server/main.ts` injects the real one
     * so dev can resolve loopback callers.
     */
    geoLookup?: IpCityLookup;
    /** Injectable for tests. */
    fetch?: typeof fetch;
    now?: () => number;
    /**
     * OpenAI-compatible API base, before `/chat/completions`. Defaults to
     * OpenCode Go; set `AI_API_URL` to point it elsewhere (see config.ts).
     */
    apiUrl?: string;
};

export type AiChatMode = "legacy" | "chat";

export type AiRelay = {
    health(): { ok: true; keyConfigured: boolean; model: string };
    models(): {
        models: ChatModelInfo[];
        defaultModel: string | null;
        keyConfigured: boolean;
    };
    chat(
        request: Request,
        auth: AuthUser,
        body: unknown,
        mode: AiChatMode,
    ): Promise<Response>;
    sandbox(request: Request, auth: AuthUser, body: unknown): Promise<Response>;
    tools(
        request: Request,
        auth: AuthUser,
        pathname: string,
        body: unknown,
    ): Promise<Response>;
    geo(request: Request, auth: AuthUser, socketIp: string): Promise<Response>;
};

function enforce(limiter: Limiter, uid: string, message: string): void {
    const result = limiter.check(uid);
    if (result.allowed) return;
    throw new HttpError(429, message, {
        code: "rate_limited",
        ...(result.retryAfterSeconds
            ? {
                  headers: {
                      "Retry-After": String(result.retryAfterSeconds),
                  },
              }
            : {}),
    });
}

function asRecord(body: unknown): Record<string, unknown> {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
        throw new HttpError(400, "请求体格式不正确", { code: "invalid_body" });
    }
    return body as Record<string, unknown>;
}

function streamResponse(
    request: Request,
    body: ReadableStream<Uint8Array>,
    status: number,
    contentType: string,
): Response {
    const headers = new Headers({
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
    });
    applyCors(new URL(request.url).pathname, headers);
    applyRequestId(request, headers);
    return new Response(body, { status, headers });
}

/** Build the relay with its own auth-independent rate-limit buckets. */
export function createAiRelay(deps: AiRelayDeps): AiRelay {
    const fetchImpl = deps.fetch ?? fetch;
    const now = deps.now ?? Date.now;
    const apiUrl = (deps.apiUrl?.trim() || DEFAULT_API_URL).replace(/\/+$/, "");
    let geoLookup: IpCityLookup | null = null;
    const chatModels =
        deps.chatModels && deps.chatModels.length > 0
            ? deps.chatModels
            : resolveChatModels();
    const defaultChatModel = pickDefaultChatModel(
        chatModels,
        deps.defaultChatModel?.trim() || deps.model,
    );
    const store = createMemoryCounterStore({ now });
    const chatMinute = createWindowLimiter(store, {
        name: "ai-chat-minute",
        limit: RATE_MAX,
        windowMs: RATE_WINDOW_MS,
        now,
    });
    const chatDaily = createDailyQuota(store, {
        name: "ai-chat-day",
        limit: deps.dailyLimit,
        now,
    });
    const sandboxDaily = createDailyQuota(store, {
        name: "ai-sandbox-day",
        limit: SANDBOX_DAILY_LIMIT,
        now,
    });
    const toolsMinute = createWindowLimiter(store, {
        name: "ai-tools-minute",
        limit: TOOLS_RATE_MAX,
        windowMs: RATE_WINDOW_MS,
        now,
    });
    const toolsDaily = createDailyQuota(store, {
        name: "ai-tools-day",
        limit: TOOLS_DAILY_LIMIT,
        now,
    });
    let sandboxInFlight = 0;
    const sandboxUserInFlight = new Map<string, number>();
    const tools: AiToolsService = createAiToolsService({
        pbBaseUrl: deps.pbBaseUrl,
        fetch: deps.fetch,
        now,
    });
    const log = logger.child("ai-relay");

    async function chatUpstream(
        request: Request,
        body: Record<string, unknown>,
        key: string,
    ): Promise<Response> {
        const serialized = JSON.stringify(body);
        if (new TextEncoder().encode(serialized).byteLength > MAX_BODY_BYTES) {
            throw new HttpError(413, "请求体过大", {
                code: "payload_too_large",
            });
        }

        const isStream = body.stream === true;
        const controller = new AbortController();
        let timedOut = false;
        const onClientAbort = () => controller.abort();
        request.signal?.addEventListener("abort", onClientAbort, {
            once: true,
        });
        const connectTimer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, CONNECT_TIMEOUT_MS);

        let upstream: Response;
        try {
            upstream = await fetchImpl(`${apiUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: /^bearer\s/i.test(key)
                        ? key
                        : `Bearer ${key}`,
                    Accept: isStream ? "text/event-stream" : "application/json",
                    "x-opencode-session":
                        (request.headers.get("x-opencode-session") ?? "").slice(
                            0,
                            200,
                        ) || "mimi-base",
                    "X-Client": "mimi-base/1.0",
                },
                body: serialized,
                signal: controller.signal,
            });
        } catch {
            clearTimeout(connectTimer);
            request.signal?.removeEventListener("abort", onClientAbort);
            if (request.signal?.aborted) {
                return new Response(null, { status: 499 });
            }
            if (timedOut) {
                throw new HttpError(504, "AI 服务响应超时了，稍后再试", {
                    code: "upstream_timeout",
                });
            }
            throw new HttpError(502, "AI 服务暂时不可用，稍后再试", {
                code: "upstream_unavailable",
            });
        }
        clearTimeout(connectTimer);

        if (!upstream.ok) {
            request.signal?.removeEventListener("abort", onClientAbort);
            // Never echo the upstream body: it may contain provider-side
            // details or fragments of the Authorization header.
            log.error("upstream error", { status: upstream.status });
            if (upstream.status === 429) {
                throw new HttpError(429, "AI 服务忙或额度用完了，稍后再试", {
                    code: "upstream_rate_limited",
                });
            }
            if (upstream.status === 400) {
                // Preserve 400 so chatJSON can retry without response_format.
                throw new HttpError(400, "AI 请求格式不被支持，稍后再试", {
                    code: "upstream_bad_request",
                });
            }
            throw new HttpError(
                502,
                upstream.status === 401 || upstream.status === 403
                    ? "AI 服务鉴权失败，请联系管理员"
                    : "AI 服务暂时不可用，稍后再试",
                { code: "upstream_unavailable" },
            );
        }

        if (!upstream.body) {
            request.signal?.removeEventListener("abort", onClientAbort);
            throw new HttpError(502, "AI 服务没有返回内容，稍后再试", {
                code: "upstream_empty",
            });
        }

        // The abort listener added before fetch stays active so a client
        // disconnect mid-stream also cancels the upstream request.
        const contentType =
            upstream.headers.get("content-type") ??
            (isStream ? "text/event-stream" : "application/json");
        return streamResponse(
            request,
            upstream.body,
            upstream.status,
            contentType,
        );
    }

    return {
        health() {
            return {
                ok: true,
                keyConfigured: Boolean(deps.apiKey.trim()),
                model: deps.model,
            };
        },

        models() {
            return {
                models: chatModels,
                defaultModel: defaultChatModel,
                keyConfigured: Boolean(deps.apiKey.trim()),
            };
        },

        async chat(request, auth, rawBody, mode) {
            enforce(chatMinute, auth.uid, CHAT_RATE_MESSAGE);

            const key = deps.apiKey.trim();
            if (!key) {
                throw new HttpError(
                    503,
                    "站点还没有配置 AI Key，请联系管理员",
                    { code: "ai_key_missing" },
                );
            }

            const body = asRecord(rawBody);

            if (mode === "chat") {
                const requested = normalizeModelId(body.model);
                const info = requested
                    ? findChatModel(chatModels, requested)
                    : findChatModel(chatModels, defaultChatModel ?? "");
                if (requested && !info) {
                    // The server owns the allowlist: an unknown id is a
                    // client bug or an attempt to spend the shared key on
                    // another model.
                    throw new HttpError(400, `不支持的模型：${requested}`, {
                        code: "unknown_model",
                    });
                }
                if (!info) {
                    throw new HttpError(503, "站点还没有配置可用的聊天模型", {
                        code: "no_chat_model",
                    });
                }
                body.model = info.id;
                if (!info.tools) {
                    delete body.tools;
                    delete body.tool_choice;
                }
                if (!info.vision && hasImagePart(body.messages)) {
                    throw new HttpError(
                        400,
                        "当前模型不支持图片，换一个支持视觉的模型",
                        { code: "vision_unsupported" },
                    );
                }
                // Thinking level is per conversation and validated here, so a
                // client cannot send an effort the model does not implement.
                const rawEffort =
                    typeof body.reasoning_effort === "string"
                        ? body.reasoning_effort.trim().toLowerCase()
                        : "";
                if (rawEffort !== "") {
                    const effort = normalizeThinkingLevel(rawEffort);
                    if (!effort || !info.thinkingLevels.includes(effort)) {
                        throw new HttpError(400, "当前模型不支持这个思考强度", {
                            code: "thinking_unsupported",
                        });
                    }
                    body.reasoning_effort = effort;
                } else {
                    delete body.reasoning_effort;
                }
            } else {
                // Legacy features get one fixed model; they cannot pick one.
                body.model = deps.model;
            }

            for (const field of ["max_tokens", "max_completion_tokens"]) {
                const value = body[field];
                if (typeof value === "number" && value > MAX_OUTPUT_TOKENS) {
                    body[field] = MAX_OUTPUT_TOKENS;
                }
            }

            enforce(chatDaily, auth.uid, CHAT_DAILY_MESSAGE);
            return chatUpstream(request, body, key);
        },

        async sandbox(request, auth, rawBody) {
            enforce(chatMinute, auth.uid, CHAT_RATE_MESSAGE);

            if (!deps.sandbox || !deps.sandbox.available()) {
                throw new HttpError(503, "沙箱正在准备，稍后再试", {
                    code: "sandbox_unavailable",
                });
            }

            const body = asRecord(rawBody);
            if (
                body.op !== "run" &&
                body.op !== "read" &&
                body.op !== "write" &&
                body.op !== "list"
            ) {
                throw new HttpError(400, "未知的沙箱操作", {
                    code: "unknown_sandbox_op",
                });
            }
            if (body.language !== undefined && body.language !== "javascript") {
                throw new HttpError(400, "未知的代码语言", {
                    code: "unknown_sandbox_language",
                });
            }

            enforce(sandboxDaily, auth.uid, SANDBOX_DAILY_MESSAGE);

            const userActive = sandboxUserInFlight.get(auth.uid) ?? 0;
            if (sandboxInFlight >= SANDBOX_MAX_IN_FLIGHT || userActive >= 1) {
                throw new HttpError(429, SANDBOX_BUSY_MESSAGE, {
                    code: "sandbox_busy",
                });
            }
            sandboxInFlight += 1;
            sandboxUserInFlight.set(auth.uid, userActive + 1);

            try {
                const result = await deps.sandbox.run(
                    body as unknown as SandboxRequest,
                );
                // `ok: false` is a user-code error and travels in the tool
                // result.
                return jsonResponse(request, result);
            } catch (error) {
                log.error("sandbox failed", {
                    error:
                        error instanceof Error
                            ? (error.stack ?? error.message)
                            : String(error),
                });
                throw new HttpError(502, "沙箱执行失败，稍后再试", {
                    code: "sandbox_failed",
                });
            } finally {
                sandboxInFlight -= 1;
                const remaining = (sandboxUserInFlight.get(auth.uid) ?? 1) - 1;
                if (remaining <= 0) sandboxUserInFlight.delete(auth.uid);
                else sandboxUserInFlight.set(auth.uid, remaining);
            }
        },

        async tools(request, auth, pathname, rawBody) {
            enforce(toolsMinute, auth.uid, TOOLS_RATE_MESSAGE);
            const body = asRecord(rawBody);
            enforce(toolsDaily, auth.uid, TOOLS_DAILY_MESSAGE);
            const result = await tools({
                pathname,
                body,
                uid: auth.uid,
                token: auth.token,
            });
            return jsonResponse(request, result.body, {
                status: result.status,
            });
        },

        async geo(request, auth, socketIp) {
            enforce(toolsMinute, auth.uid, TOOLS_RATE_MESSAGE);
            const lookup =
                deps.geoLookup ??
                (geoLookup ??= createIpCityLookup({ fetch: fetchImpl }));
            const info = await lookup(resolveClientIp(request, socketIp));
            return jsonResponse(request, {
                city: info?.city ?? "",
                region: info?.region ?? "",
                country: info?.country ?? "",
            });
        },
    };
}
