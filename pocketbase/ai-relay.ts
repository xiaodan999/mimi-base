/**
 * Bun streaming relay for the site's OpenCode Go key.
 *
 * Mounted on the supervisor's HTTP server (see server.ts). The browser never
 * sees an API key: it authenticates with its PocketBase token, and this module
 * forwards the OpenAI-compatible request to opencode.ai with the server key.
 * Unlike the old JSVM hook, the upstream body is piped back as a
 * ReadableStream, so SSE reaches the client token by token.
 *
 * The relay is stateless apart from in-memory rate limits and a short auth
 * cache. The key is never logged or returned to the client.
 */

import { createHash } from "node:crypto";

import { AI_FILES_PATH, FileReadError, extractUploadedFile } from "./ai-files";
import {
    AI_TOOLS_EXPENSES_PATH,
    AI_TOOLS_MEMORY_PATH,
    AI_TOOLS_POSTS_PATH,
    AI_TOOLS_URL_PATH,
    createAiToolsService,
    type AiToolsCall,
} from "./ai-tools";
import { MAX_FILE_BYTES } from "../lib/chat-files";
import type { SandboxRequest, SandboxResponse } from "../lib/sandbox-protocol";
import {
    createIpCityLookup,
    resolveClientIp,
    type IpCityLookup,
} from "./geo-ip";
import {
    findChatModel,
    hasImagePart,
    normalizeModelId,
    normalizeThinkingLevel,
    pickDefaultChatModel,
    resolveChatModels,
    type ChatModelInfo,
} from "./chat-models";

export const AI_RELAY_PREFIX = "/ai";
export const AI_CHAT_PATH = "/ai/opencode/v1/chat/completions";
/** General chat entry point: honours the server allowlist instead of forcing one model. */
export const AI_CHAT_COMPLETIONS_PATH = "/ai/chat/completions";
export const AI_MODELS_PATH = "/ai/models";
export const AI_SANDBOX_PATH = "/ai/sandbox";
export const AI_HEALTH_PATH = "/ai/health";
/** Chat location feature: caller IP -> city estimate (see geo-ip.ts). */
export const AI_GEO_IP_PATH = "/ai/geo/ip";

const UPSTREAM_URL = "https://opencode.ai/zen/go/v1/chat/completions";
const MAX_BODY_BYTES = 4 * 1024 * 1024;
/** Tool calls carry whole files in their arguments; 4k truncated them. */
const MAX_OUTPUT_TOKENS = 8192;
const MAX_UPLOAD_BYTES = MAX_FILE_BYTES;
const MAX_UPLOAD_LABEL = `${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB`;
const MAX_SANDBOX_BODY_BYTES = 1024 * 1024;
const SANDBOX_DAILY_LIMIT = 200;
const SANDBOX_MAX_IN_FLIGHT = 4;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
/** Data tools (expenses/posts/memory/url) get their own, looser limits. */
const TOOLS_RATE_MAX = 30;
const TOOLS_DAILY_LIMIT = 200;
const MAX_TOOLS_BODY_BYTES = 64 * 1024;
const AUTH_CACHE_MS = 60_000;
const AUTH_CACHE_MAX = 1000;
const CONNECT_TIMEOUT_MS = 30_000;

const CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
        "Authorization, Content-Type, x-opencode-session, x-client, x-file-name, x-file-images",
    "Access-Control-Max-Age": "600",
};

export type SandboxService = {
    run: (request: SandboxRequest) => Promise<SandboxResponse>;
    available: () => boolean;
};

export type AiRelayDeps = {
    /** Loopback PocketBase base URL, e.g. http://127.0.0.1:8090 */
    pbBaseUrl: string;
    /** Server-held OpenCode Go key. Empty disables chat (health stays up). */
    apiKey: string;
    /** Model forced on every legacy request (`/ai/opencode/v1/...`). */
    model: string;
    /**
     * Models the general chat may pick from. Omit to derive the list from
     * `model` plus the built-in catalog.
     */
    chatModels?: ChatModelInfo[];
    /** Chat model used when a request leaves `model` empty. */
    defaultChatModel?: string;
    /** Per-user daily request cap for the shared key; 0 = unlimited. */
    dailyLimit: number;
    /** Server-side code sandbox; omitted in focused tests. */
    sandbox?: SandboxService;
    /**
     * IP -> city resolver for /ai/geo/ip. Built on first use (without the
     * dev egress fallback) when omitted; server.ts injects the real one so
     * dev can resolve loopback callers.
     */
    geoLookup?: IpCityLookup;
    /** Injectable for tests. */
    fetch?: typeof fetch;
    now?: () => number;
};

type AuthOk = { ok: true; uid: string; token: string };
type AuthFail = { ok: false; response: Response };

type MinuteBucket = { start: number; count: number };
type DayBucket = { day: string; count: number };

/**
 * `socketIp` is the TCP peer address from the supervisor (`server.requestIP`),
 * used when no proxy header is present.
 */
export type AiRelay = (
    req: Request,
    socketIp?: string,
) => Promise<Response | null>;

/** Build a handler with its own auth cache and rate-limit buckets. */
export function createAiRelay(deps: AiRelayDeps): AiRelay {
    const fetchImpl = deps.fetch ?? fetch;
    const now = deps.now ?? Date.now;
    let geoLookup: IpCityLookup | null = null;
    const chatModels =
        deps.chatModels && deps.chatModels.length > 0
            ? deps.chatModels
            : resolveChatModels();
    const defaultChatModel = pickDefaultChatModel(
        chatModels,
        deps.defaultChatModel?.trim() || deps.model,
    );
    const authCache = new Map<string, { uid: string; expiresAt: number }>();
    const minuteBuckets = new Map<string, MinuteBucket>();
    const dayBuckets = new Map<string, DayBucket>();
    const toolsMinuteBuckets = new Map<string, MinuteBucket>();
    const toolsDayBuckets = new Map<string, DayBucket>();
    const sandboxDayBuckets = new Map<string, DayBucket>();
    const sandboxUserInFlight = new Map<string, number>();
    let sandboxInFlight = 0;
    const tools = createAiToolsService({
        pbBaseUrl: deps.pbBaseUrl,
        fetch: deps.fetch,
        now,
    });

    async function authenticate(req: Request): Promise<AuthOk | AuthFail> {
        const header = req.headers.get("authorization")?.trim() ?? "";
        const token = header.replace(/^bearer\s+/i, "").trim();
        if (!token) return { ok: false, response: unauthorized() };

        const cacheKey = createHash("sha256").update(token).digest("hex");
        const cached = authCache.get(cacheKey);
        if (cached && now() < cached.expiresAt) {
            return { ok: true, uid: cached.uid, token };
        }

        let res: Response;
        try {
            res = await fetchImpl(
                `${deps.pbBaseUrl}/api/collections/users/auth-refresh`,
                {
                    method: "POST",
                    headers: { Authorization: token },
                    signal: AbortSignal.timeout(5_000),
                },
            );
        } catch {
            return { ok: false, response: serviceUnavailable() };
        }

        if (res.status === 401 || res.status === 403) {
            authCache.delete(cacheKey);
            return { ok: false, response: unauthorized() };
        }
        if (!res.ok) return { ok: false, response: serviceUnavailable() };

        let uid = "";
        try {
            const json = (await res.json()) as {
                record?: { id?: unknown };
            };
            if (typeof json.record?.id === "string") uid = json.record.id;
        } catch {
            // fall through to the unauthenticated response
        }
        if (!uid) return { ok: false, response: unauthorized() };

        if (authCache.size >= AUTH_CACHE_MAX) authCache.clear();
        authCache.set(cacheKey, { uid, expiresAt: now() + AUTH_CACHE_MS });
        return { ok: true, uid, token };
    }

    function checkRate(uid: string): Response | null {
        const t = now();
        const bucket = minuteBuckets.get(uid);
        if (!bucket || t - bucket.start >= RATE_WINDOW_MS) {
            minuteBuckets.set(uid, { start: t, count: 1 });
        } else if (bucket.count >= RATE_MAX) {
            const retryAfter = Math.max(
                1,
                Math.ceil((bucket.start + RATE_WINDOW_MS - t) / 1000),
            );
            return json(
                429,
                { error: { message: "请求太频繁了，歇一会儿再试" } },
                { "Retry-After": String(retryAfter) },
            );
        } else {
            bucket.count += 1;
        }
        return null;
    }

    function checkDaily(uid: string): Response | null {
        if (deps.dailyLimit <= 0) return null;
        const day = new Date(now()).toISOString().slice(0, 10);
        const bucket = dayBuckets.get(uid);
        if (!bucket || bucket.day !== day) {
            dayBuckets.set(uid, { day, count: 1 });
            return null;
        }
        if (bucket.count >= deps.dailyLimit) {
            return json(429, {
                error: {
                    message: "今天的 AI 次数用完了，明天再试",
                },
            });
        }
        bucket.count += 1;
        return null;
    }

    function checkSandboxQuota(uid: string): Response | null {
        const day = new Date(now()).toISOString().slice(0, 10);
        const bucket = sandboxDayBuckets.get(uid);
        if (!bucket || bucket.day !== day) {
            sandboxDayBuckets.set(uid, { day, count: 1 });
            return null;
        }
        if (bucket.count >= SANDBOX_DAILY_LIMIT) {
            return json(429, {
                error: { message: "今天的沙箱次数用完了，明天再试" },
            });
        }
        bucket.count += 1;
        return null;
    }

    function checkToolsRate(uid: string): Response | null {
        const t = now();
        const bucket = toolsMinuteBuckets.get(uid);
        if (!bucket || t - bucket.start >= RATE_WINDOW_MS) {
            toolsMinuteBuckets.set(uid, { start: t, count: 1 });
        } else if (bucket.count >= TOOLS_RATE_MAX) {
            const retryAfter = Math.max(
                1,
                Math.ceil((bucket.start + RATE_WINDOW_MS - t) / 1000),
            );
            return json(
                429,
                { error: { message: "工具请求太频繁了，歇一会儿再试" } },
                { "Retry-After": String(retryAfter) },
            );
        } else {
            bucket.count += 1;
        }
        return null;
    }

    function checkToolsQuota(uid: string): Response | null {
        const day = new Date(now()).toISOString().slice(0, 10);
        const bucket = toolsDayBuckets.get(uid);
        if (!bucket || bucket.day !== day) {
            toolsDayBuckets.set(uid, { day, count: 1 });
            return null;
        }
        if (bucket.count >= TOOLS_DAILY_LIMIT) {
            return json(429, {
                error: { message: "今天的工具次数用完了，明天再试" },
            });
        }
        bucket.count += 1;
        return null;
    }

    const TOOL_PATHS = new Set<string>([
        AI_TOOLS_EXPENSES_PATH,
        AI_TOOLS_POSTS_PATH,
        AI_TOOLS_MEMORY_PATH,
        AI_TOOLS_URL_PATH,
    ]);

    async function toolsEndpoint(req: Request): Promise<Response> {
        const auth = await authenticate(req);
        if (!auth.ok) return auth.response;

        const limited = checkToolsRate(auth.uid);
        if (limited) return limited;

        const declared = Number(req.headers.get("content-length") ?? 0);
        if (Number.isFinite(declared) && declared > MAX_TOOLS_BODY_BYTES) {
            return json(413, { error: { message: "请求体过大" } });
        }

        let body: Record<string, unknown>;
        try {
            const parsed = (await req.json()) as unknown;
            if (
                typeof parsed !== "object" ||
                parsed === null ||
                Array.isArray(parsed)
            ) {
                return json(400, { error: { message: "请求体格式不正确" } });
            }
            body = parsed as Record<string, unknown>;
        } catch {
            return json(400, { error: { message: "请求体不是合法的 JSON" } });
        }

        const quota = checkToolsQuota(auth.uid);
        if (quota) return quota;

        const call: AiToolsCall = {
            pathname: new URL(req.url).pathname,
            body,
            uid: auth.uid,
            token: auth.token,
        };
        const result = await tools(call);
        return json(result.status, result.body);
    }

    /**
     * Reads one chat attachment. The file is parsed here, so the browser never
     * loads pdf.js and Chinese/scanned PDFs behave the same on every device.
     * Nothing is persisted: the client appends the returned text (or page
     * images) to the message like any other attachment.
     */
    async function uploadFile(req: Request): Promise<Response> {
        const auth = await authenticate(req);
        if (!auth.ok) return auth.response;

        // Uploads share the data-tool budget: they are user-triggered and
        // parsing a PDF costs server CPU.
        const limited = checkToolsRate(auth.uid);
        if (limited) return limited;

        const declared = Number(req.headers.get("content-length") ?? 0);
        if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
            return json(413, {
                error: { message: `文件太大了（最大 ${MAX_UPLOAD_LABEL}）` },
            });
        }

        const quota = checkToolsQuota(auth.uid);
        if (quota) return quota;

        let data: Uint8Array;
        try {
            data = new Uint8Array(await req.arrayBuffer());
        } catch {
            return json(400, { error: { message: "文件读取失败，再试一次" } });
        }
        if (data.byteLength > MAX_UPLOAD_BYTES) {
            return json(413, {
                error: { message: `文件太大了（最大 ${MAX_UPLOAD_LABEL}）` },
            });
        }
        if (data.byteLength === 0) {
            return json(400, { error: { message: "文件是空的" } });
        }

        const headerName = req.headers.get("x-file-name") ?? "";
        let name = headerName;
        try {
            name = decodeURIComponent(headerName);
        } catch {
            // Keep the raw header; sanitizeFileName handles the rest.
        }
        const requestedImages = Number(req.headers.get("x-file-images") ?? "0");
        const pageImageLimit =
            Number.isFinite(requestedImages) && requestedImages > 0
                ? requestedImages
                : 0;

        try {
            const file = await extractUploadedFile(name, data, {
                pageImageLimit,
            });
            return json(200, { ok: true, ...file });
        } catch (error) {
            if (error instanceof FileReadError) {
                return json(error.status, {
                    error: { message: error.message },
                });
            }
            console.error("[ai-relay] attachment read failed", error);
            return json(500, {
                error: { message: "文件读取失败，再试一次" },
            });
        }
    }

    async function sandbox(req: Request): Promise<Response> {
        const auth = await authenticate(req);
        if (!auth.ok) return auth.response;

        const limited = checkRate(auth.uid);
        if (limited) return limited;

        if (!deps.sandbox || !deps.sandbox.available()) {
            return json(503, {
                error: { message: "沙箱正在准备，稍后再试" },
            });
        }

        const declared = Number(req.headers.get("content-length") ?? 0);
        if (Number.isFinite(declared) && declared > MAX_SANDBOX_BODY_BYTES) {
            return json(413, { error: { message: "请求体过大" } });
        }

        let body: Record<string, unknown>;
        try {
            const parsed = (await req.json()) as unknown;
            if (
                typeof parsed !== "object" ||
                parsed === null ||
                Array.isArray(parsed)
            ) {
                return json(400, { error: { message: "请求体格式不正确" } });
            }
            body = parsed as Record<string, unknown>;
        } catch {
            return json(400, { error: { message: "请求体不是合法的 JSON" } });
        }

        if (
            body.op !== "run" &&
            body.op !== "read" &&
            body.op !== "write" &&
            body.op !== "list"
        ) {
            return json(400, { error: { message: "未知的沙箱操作" } });
        }
        if (
            body.language !== undefined &&
            body.language !== "python" &&
            body.language !== "javascript"
        ) {
            return json(400, { error: { message: "未知的代码语言" } });
        }

        const quota = checkSandboxQuota(auth.uid);
        if (quota) return quota;

        const userActive = sandboxUserInFlight.get(auth.uid) ?? 0;
        if (sandboxInFlight >= SANDBOX_MAX_IN_FLIGHT || userActive >= 1) {
            return json(429, {
                error: { message: "沙箱正忙，稍后再试" },
            });
        }
        sandboxInFlight += 1;
        sandboxUserInFlight.set(auth.uid, userActive + 1);

        try {
            const result = await deps.sandbox.run(body as SandboxRequest);
            // `ok: false` is a user-code error and travels in the tool result.
            return json(200, result);
        } catch (error) {
            console.error("[ai-relay] sandbox failed", error);
            return json(502, { error: { message: "沙箱执行失败，稍后再试" } });
        } finally {
            sandboxInFlight -= 1;
            const remaining = (sandboxUserInFlight.get(auth.uid) ?? 1) - 1;
            if (remaining <= 0) sandboxUserInFlight.delete(auth.uid);
            else sandboxUserInFlight.set(auth.uid, remaining);
        }
    }

    async function chat(
        req: Request,
        mode: "legacy" | "chat" = "legacy",
    ): Promise<Response> {
        const auth = await authenticate(req);
        if (!auth.ok) return auth.response;

        const limited = checkRate(auth.uid);
        if (limited) return limited;

        const key = deps.apiKey.trim();
        if (!key) {
            return json(503, {
                error: {
                    message: "站点还没有配置 AI Key，请联系管理员",
                },
            });
        }

        const declared = Number(req.headers.get("content-length") ?? 0);
        if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
            return json(413, { error: { message: "请求体过大" } });
        }

        let body: Record<string, unknown>;
        try {
            const parsed = (await req.json()) as unknown;
            if (
                typeof parsed !== "object" ||
                parsed === null ||
                Array.isArray(parsed)
            ) {
                return json(400, { error: { message: "请求体格式不正确" } });
            }
            body = parsed as Record<string, unknown>;
        } catch {
            return json(400, { error: { message: "请求体不是合法的 JSON" } });
        }

        if (mode === "chat") {
            const requested = normalizeModelId(body.model);
            const info = requested
                ? findChatModel(chatModels, requested)
                : findChatModel(chatModels, defaultChatModel ?? "");
            if (requested && !info) {
                // The server owns the allowlist: an unknown id is a client bug
                // or an attempt to spend the shared key on another model.
                return json(400, {
                    error: { message: `不支持的模型：${requested}` },
                });
            }
            if (!info) {
                return json(503, {
                    error: { message: "站点还没有配置可用的聊天模型" },
                });
            }
            body.model = info.id;
            if (!info.tools) {
                delete body.tools;
                delete body.tool_choice;
            }
            if (!info.vision && hasImagePart(body.messages)) {
                return json(400, {
                    error: {
                        message: "当前模型不支持图片，换一个支持视觉的模型",
                    },
                });
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
                    return json(400, {
                        error: { message: "当前模型不支持这个思考强度" },
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

        const serialized = JSON.stringify(body);
        if (new TextEncoder().encode(serialized).byteLength > MAX_BODY_BYTES) {
            return json(413, { error: { message: "请求体过大" } });
        }

        const quota = checkDaily(auth.uid);
        if (quota) return quota;

        const isStream = body.stream === true;
        const controller = new AbortController();
        let timedOut = false;
        const onClientAbort = () => controller.abort();
        req.signal?.addEventListener("abort", onClientAbort, { once: true });
        const connectTimer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, CONNECT_TIMEOUT_MS);

        let upstream: Response;
        try {
            upstream = await fetchImpl(UPSTREAM_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: /^bearer\s/i.test(key)
                        ? key
                        : `Bearer ${key}`,
                    Accept: isStream ? "text/event-stream" : "application/json",
                    "x-opencode-session":
                        (req.headers.get("x-opencode-session") ?? "").slice(
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
            req.signal?.removeEventListener("abort", onClientAbort);
            if (req.signal?.aborted) return canceled();
            if (timedOut) {
                return json(504, {
                    error: { message: "AI 服务响应超时了，稍后再试" },
                });
            }
            return json(502, {
                error: { message: "AI 服务暂时不可用，稍后再试" },
            });
        }
        clearTimeout(connectTimer);

        if (!upstream.ok) {
            req.signal?.removeEventListener("abort", onClientAbort);
            // Never echo the upstream body: it may contain provider-side
            // details or fragments of the Authorization header.
            console.error("[ai-relay] upstream error", upstream.status);
            if (upstream.status === 429) {
                return json(429, {
                    error: {
                        message: "AI 服务忙或额度用完了，稍后再试",
                    },
                });
            }
            if (upstream.status === 400) {
                // Preserve 400 so chatJSON can retry without response_format.
                return json(400, {
                    error: {
                        message: "AI 请求格式不被支持，稍后再试",
                    },
                });
            }
            return json(502, {
                error: {
                    message:
                        upstream.status === 401 || upstream.status === 403
                            ? "AI 服务鉴权失败，请联系管理员"
                            : "AI 服务暂时不可用，稍后再试",
                },
            });
        }

        if (!upstream.body) {
            req.signal?.removeEventListener("abort", onClientAbort);
            return json(502, {
                error: { message: "AI 服务没有返回内容，稍后再试" },
            });
        }

        // The abort listener added before fetch stays active so a client
        // disconnect mid-stream also cancels the upstream request.

        const headers = new Headers(CORS_HEADERS);
        headers.set(
            "Content-Type",
            upstream.headers.get("content-type") ??
                (isStream ? "text/event-stream" : "application/json"),
        );
        headers.set("Cache-Control", "no-cache, no-transform");
        headers.set("X-Accel-Buffering", "no");
        return new Response(upstream.body, {
            status: upstream.status,
            headers,
        });
    }

    /**
     * City estimate for the chat location feature. The user taps the button
     * in the panel and confirms the result, so this is not a silent lookup;
     * the answer is city-level and carries no coordinates. Cheap offline
     * lookup, so requests share the data tools' minute budget but not the
     * daily quota.
     */
    async function geoIp(req: Request, socketIp: string): Promise<Response> {
        const auth = await authenticate(req);
        if (!auth.ok) return auth.response;

        const limited = checkToolsRate(auth.uid);
        if (limited) return limited;

        const lookup =
            deps.geoLookup ??
            (geoLookup ??= createIpCityLookup({ fetch: fetchImpl }));
        const info = await lookup(resolveClientIp(req, socketIp));
        return json(200, {
            city: info?.city ?? "",
            region: info?.region ?? "",
            country: info?.country ?? "",
        });
    }

    async function handle(
        req: Request,
        socketIp = "",
    ): Promise<Response | null> {
        const url = new URL(req.url);
        if (
            url.pathname !== AI_RELAY_PREFIX &&
            !url.pathname.startsWith(`${AI_RELAY_PREFIX}/`)
        ) {
            return null;
        }

        if (req.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        if (url.pathname === AI_HEALTH_PATH && req.method === "GET") {
            return json(200, {
                ok: true,
                keyConfigured: Boolean(deps.apiKey.trim()),
                model: deps.model,
            });
        }

        if (url.pathname === AI_GEO_IP_PATH && req.method === "GET") {
            return geoIp(req, socketIp);
        }

        if (url.pathname === AI_MODELS_PATH && req.method === "GET") {
            const auth = await authenticate(req);
            if (!auth.ok) return auth.response;
            return json(200, {
                models: chatModels,
                defaultModel: defaultChatModel,
                keyConfigured: Boolean(deps.apiKey.trim()),
            });
        }

        if (url.pathname === AI_SANDBOX_PATH && req.method === "POST") {
            return sandbox(req);
        }

        if (url.pathname === AI_FILES_PATH && req.method === "POST") {
            return uploadFile(req);
        }

        if (TOOL_PATHS.has(url.pathname) && req.method === "POST") {
            return toolsEndpoint(req);
        }

        if (
            url.pathname === AI_CHAT_COMPLETIONS_PATH &&
            req.method === "POST"
        ) {
            return chat(req, "chat");
        }

        if (url.pathname === AI_CHAT_PATH && req.method === "POST") {
            return chat(req);
        }

        return json(404, { error: { message: "not found" } });
    }

    return handle;
}

function json(
    status: number,
    body: unknown,
    extra?: Record<string, string>,
): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...CORS_HEADERS,
            ...extra,
        },
    });
}

function unauthorized(): Response {
    return json(401, {
        error: { message: "登录已过期，请重新登录" },
    });
}

function serviceUnavailable(): Response {
    return json(503, {
        error: { message: "AI 服务正在启动，稍后再试" },
    });
}

function canceled(): Response {
    return new Response(null, { status: 499 });
}
