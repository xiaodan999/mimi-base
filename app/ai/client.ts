import { z } from "zod";

import { getAiSessionId, type AiSettings } from "./config";
import { AI_MODEL } from "./constants";
import { getAiRelayBaseUrl } from "./endpoint";
import { getAiAuthToken } from "./pb-token";
import { isOverBudget, recordUsage, type AiUsage } from "./usage";

/*
 * 站点统一提供 AI：浏览器只带自己的 PocketBase 令牌调用 `/ai` 中转，
 * API Key 永远留在服务端（pocketbase/ai-relay.ts）。这里不再保存或发送
 * 任何用户 Key，也不再支持自定义服务商地址。
 */

export type AiRole = "system" | "user" | "assistant";

/** OpenAI 兼容的多模态内容块，目前只用到文字和图片。 */
export type AiContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

export type AiMessage = {
    role: AiRole;
    content: string | AiContentPart[];
};

/** 把一段文字和若干张图拼成一条多模态消息。 */
export function visionMessage(text: string, imageUrls: string[]): AiMessage {
    const content: AiContentPart[] = [{ type: "text", text }];
    for (const url of imageUrls) {
        content.push({ type: "image_url", image_url: { url } });
    }
    return { role: "user", content };
}

export type ChatUsage = {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
};

export type ChatResponse = {
    choices?: {
        message?: { content?: string };
        delta?: { content?: string };
    }[];
    usage?: ChatUsage;
    error?: string | { message?: string };
};

export class AiError extends Error {
    status?: number;

    constructor(message: string, status?: number) {
        super(message);
        this.name = "AiError";
        this.status = status;
    }
}

/** 各功能的默认 max_tokens：短文案少给，长讲解/周报多给，避免失控花销。 */
export const DEFAULT_MAX_TOKENS = {
    stream: 1600,
    text: 600,
    json: 1200,
};

/** 连接 / 首包超时：只覆盖到响应头返回为止。 */
const REQUEST_TIMEOUT_MS = 60_000;
/** 响应体静默超时：流式每收到一段就重置；一次性响应覆盖整个 body。 */
const BODY_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8_000;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/** 站点中转的 chat completions 地址（由 AiProvider 注入）。 */
function chatEndpoint(): string {
    const base = getAiRelayBaseUrl().trim().replace(/\/+$/, "");
    if (!base) return "";
    if (/\/chat\/completions$/.test(base)) return base;
    return `${base}/chat/completions`;
}

function friendlyStatus(status: number): string {
    if (status === 401 || status === 403) return "登录已过期，请重新登录";
    if (status === 404) return "AI 服务地址不对，检查部署里的 /ai 代理";
    if (status === 408) return "请求超时了，稍后再试";
    if (status === 429) return "请求太频繁或今天的额度用完了，歇一会儿再试";
    if (status >= 500) return "AI 服务暂时不可用，稍后再试";
    return `请求失败（HTTP ${status}）`;
}

async function readError(res: Response): Promise<AiError> {
    let detail = "";
    try {
        const text = await res.text();
        try {
            const json = JSON.parse(text) as {
                error?: { message?: string } | string;
                message?: string;
            };
            detail =
                (typeof json.error === "string"
                    ? json.error
                    : json.error?.message) ??
                json.message ??
                "";
        } catch {
            // 非 JSON（例如代理的错误页）不要把 HTML 塞给用户。
        }
    } catch {
        // ignore
    }
    return new AiError(
        detail ? detail.slice(0, 160) : friendlyStatus(res.status),
        res.status,
    );
}

/**
 * fetch 被 abort 时，不同浏览器抛出的对象不完全一样，
 * 统一用这个名字判断，别把「已取消」当成失败提示。
 */
export function isAiCanceled(error: unknown): boolean {
    return (
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError")
    );
}

/** 图片转码、查库这类预处理结束后，任务可能已经被取消 */
export function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
    }
}

export function aiErrorText(error: unknown): string {
    if (error instanceof AiError) return error.message;
    if (isAiCanceled(error)) {
        return "已取消";
    }
    if (error instanceof TypeError) {
        return "请求没发出去：可能是网络问题，或站点的 /ai 代理没有配置好。";
    }
    return error instanceof Error ? error.message : "AI 请求失败";
}

function headers(): HeadersInit {
    const result: Record<string, string> = {
        "Content-Type": "application/json",
        "x-opencode-session": getAiSessionId(),
        "X-Client": "mimi-base/1.0",
    };
    // 中转用 PB 用户令牌鉴权；Key 由服务端补上。
    const token = getAiAuthToken();
    if (token) result.Authorization = token;
    return result;
}

/* ------------------------------------------------------------------ */
/* 超时 + 重试                                                         */
/* ------------------------------------------------------------------ */

type SignalCtx = {
    signal: AbortSignal;
    timedOut: () => boolean;
    /**
     * 重新计时（0 = 停表）。连接阶段和读取响应体阶段需要不同 deadline：
     * 慢速生成 1600 token 可以远超 60 秒，那个超时只该管到响应头到达为止；
     * 响应体改用「静默多久没数据」兜底，流式每来一段就重置一次。
     */
    arm: (ms: number) => void;
    cleanup: () => void;
};

/**
 * 把「调用方的取消 signal」和一个可重置的「超时 deadline」合成一个 signal。
 * 等价于 AbortSignal.any([caller, AbortSignal.timeout(ms)])，但定时器可以
 * 重新 arm/clear，请求结束后能收掉，不会留下悬挂定时器。
 */
function composeSignal(
    signal: AbortSignal | undefined,
    timeoutMs: number,
): SignalCtx {
    const controller = new AbortController();
    let timedOutFlag = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onCallerAbort = () => controller.abort();
    const arm = (ms: number) => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        if (ms <= 0) return;
        timer = setTimeout(() => {
            timedOutFlag = true;
            controller.abort();
        }, ms);
    };
    arm(timeoutMs);
    if (signal?.aborted) {
        controller.abort();
    } else {
        signal?.addEventListener("abort", onCallerAbort, { once: true });
    }
    return {
        signal: controller.signal,
        timedOut: () => timedOutFlag && !signal?.aborted,
        arm,
        cleanup: () => {
            if (timer !== null) clearTimeout(timer);
            timer = null;
            signal?.removeEventListener("abort", onCallerAbort);
        },
    };
}

/** 超时统一变成 AiError（带 408），调用方取消则保留原 AbortError。 */
function classifyAbort(error: unknown, timedOut: boolean): unknown {
    if (timedOut) return new AiError("AI 请求超时了，稍后再试", 408);
    return error;
}

function abortError(): DOMException {
    return new DOMException("Aborted", "AbortError");
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
            reject(abortError());
            return;
        }
        const timer = setTimeout(() => {
            cleanup();
            resolve();
        }, ms);
        const onAbort = () => {
            cleanup();
            reject(abortError());
        };
        const cleanup = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", onAbort);
        };
        signal.addEventListener("abort", onAbort, { once: true });
    });
}

function backoff(attempt: number): number {
    return Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
}

/** Retry-After 既可能是秒数，也可能是 HTTP 日期。 */
export function parseRetryAfter(value: string | null): number | undefined {
    if (!value) return undefined;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(value);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
    return undefined;
}

async function requestWithRetry(
    url: string,
    makeInit: () => RequestInit,
    ctx: SignalCtx,
): Promise<Response> {
    let attempt = 0;
    while (true) {
        let res: Response;
        try {
            res = await fetch(url, makeInit());
        } catch (error) {
            if (ctx.signal.aborted) throw error;
            if (attempt < MAX_RETRIES) {
                await sleep(backoff(attempt), ctx.signal);
                attempt += 1;
                continue;
            }
            throw error;
        }
        if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
            const delay =
                parseRetryAfter(res.headers.get("retry-after")) ??
                backoff(attempt);
            await sleep(Math.min(delay, MAX_BACKOFF_MS), ctx.signal);
            attempt += 1;
            continue;
        }
        return res;
    }
}

type RequestOptions = {
    stream: boolean;
    temperature: number;
    maxTokens: number;
    responseFormat?: boolean;
    signal?: AbortSignal;
};

type Performed = {
    res: Response;
    model: string;
    ctx: SignalCtx;
};

function buildPayload(messages: AiMessage[], options: RequestOptions): string {
    const body: Record<string, unknown> = {
        model: AI_MODEL,
        messages,
        stream: options.stream,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
    };
    // 结构化输出：有 zod schema 时请求 json_object，让模型少包 markdown。
    if (options.responseFormat) {
        body.response_format = { type: "json_object" };
    }
    return JSON.stringify(body);
}

async function performRequest(
    settings: AiSettings,
    messages: AiMessage[],
    options: RequestOptions,
): Promise<Performed> {
    if (isOverBudget(settings)) {
        throw new AiError("今天的 AI 预算用完了，明天再来，或到设置里调高上限");
    }
    const url = chatEndpoint();
    if (!url) throw new AiError("AI 服务地址未初始化，刷新页面再试");

    const ctx = composeSignal(options.signal, REQUEST_TIMEOUT_MS);
    const makeInit = (): RequestInit => ({
        method: "POST",
        headers: headers(),
        body: buildPayload(messages, options),
        signal: ctx.signal,
    });

    try {
        const res = await requestWithRetry(url, makeInit, ctx);
        // 响应头已到：后面的时间交给读响应体的调用方按需重新计时。
        ctx.arm(0);
        return { res, model: AI_MODEL, ctx };
    } catch (error) {
        ctx.cleanup();
        throw classifyAbort(error, ctx.timedOut());
    }
}

function recordUsageFor(model: string, usage: ChatUsage | undefined) {
    if (!usage) return;
    const promptTokens = usage.prompt_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? 0;
    const value: AiUsage = {
        promptTokens,
        completionTokens,
        totalTokens: usage.total_tokens ?? promptTokens + completionTokens,
    };
    recordUsage(model, value);
}

/* ------------------------------------------------------------------ */
/* SSE 解码                                                            */
/* ------------------------------------------------------------------ */

/**
 * 真正的 SSE 帧解析：按 \r\n / \r / \n 切行，累积一个事件里的多行 data:，
 * 用空行表示一个事件结束。注释、event/id/retry 行忽略。
 * 返回每次 push 期间「已经收齐」的事件 data 字符串（多行已用 \n 拼好）。
 */
export function createSseParser() {
    let buffer = "";
    let dataLines: string[] = [];

    const takeEvent = (): string | null => {
        if (dataLines.length === 0) return null;
        const joined = dataLines.join("\n");
        dataLines = [];
        return joined;
    };

    const handleLine = (line: string): string | null => {
        if (line === "") return takeEvent();
        if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).replace(/^ /, ""));
        }
        // ":" 注释、event:/id:/retry: 都忽略
        return null;
    };

    return {
        push(chunk: string): string[] {
            buffer += chunk;
            const lines = buffer.split(/\r\n|\r|\n/);
            buffer = lines.pop() ?? "";
            const events: string[] = [];
            for (const line of lines) {
                const event = handleLine(line);
                if (event !== null) events.push(event);
            }
            return events;
        },
        end(): string[] {
            const events: string[] = [];
            if (buffer) {
                const event = handleLine(buffer);
                if (event !== null) events.push(event);
                buffer = "";
            }
            const tail = takeEvent();
            if (tail !== null) events.push(tail);
            return events;
        },
    };
}

type SseOutcome = {
    done: boolean;
    content?: string;
    usage?: ChatUsage;
};

/** 解析一个 SSE 事件：识别 [DONE]、错误载荷、usage、正文增量。 */
export function parseSseEvent(data: string): SseOutcome {
    if (data.trim() === "[DONE]") return { done: true };
    let json: ChatResponse;
    try {
        json = JSON.parse(data) as ChatResponse;
    } catch {
        return { done: false };
    }
    if (json.error) {
        const message =
            typeof json.error === "string"
                ? json.error
                : json.error?.message || "未知错误";
        throw new AiError(`AI 流式返回出错：${message}`);
    }
    return {
        done: false,
        content:
            json.choices?.[0]?.delta?.content ??
            json.choices?.[0]?.message?.content,
        usage: json.usage,
    };
}

/* ------------------------------------------------------------------ */
/* 对外对话接口                                                        */
/* ------------------------------------------------------------------ */

/**
 * 流式对话：逐段 yield 文本，适合讲解 / 错题分析 / 周报。
 * - 请求带超时与 429/5xx 重试；关掉面板不会中止（由 runTask 持有 signal）。
 * - 每收到一块就重置空闲超时，长回答不会因为总时长被掐断。
 * - 遇到 [DONE] 停止，data: {"error":...} 会抛 AiError。
 */
export async function* streamChat(
    settings: AiSettings,
    messages: AiMessage[],
    signal?: AbortSignal,
    options?: { maxTokens?: number; temperature?: number },
): AsyncGenerator<string> {
    const { res, model, ctx } = await performRequest(settings, messages, {
        stream: true,
        temperature: options?.temperature ?? 0.7,
        maxTokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS.stream,
        signal,
    });

    try {
        if (!res.ok) throw await readError(res);
        // 只有「长时间没有任何数据」才算超时，整段生成可以慢慢来。
        ctx.arm(BODY_TIMEOUT_MS);

        const type = res.headers.get("content-type") ?? "";
        if (!type.includes("event-stream") || !res.body) {
            // 个别服务会忽略 stream，直接返回一整段 JSON
            const json = (await res.json()) as ChatResponse;
            recordUsageFor(model, json.usage);
            const content = json.choices?.[0]?.message?.content;
            if (content) yield content;
            return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = createSseParser();
        let finished = false;

        while (!finished) {
            const { done, value } = await reader.read();
            if (done) break;
            ctx.arm(BODY_TIMEOUT_MS); // 每来一段就重新计时
            const events = parser.push(decoder.decode(value, { stream: true }));
            for (const data of events) {
                const outcome = parseSseEvent(data);
                recordUsageFor(model, outcome.usage);
                if (outcome.done) {
                    finished = true;
                    break;
                }
                if (outcome.content) yield outcome.content;
            }
            if (finished) {
                await reader.cancel().catch(() => {});
                break;
            }
        }

        if (!finished) {
            for (const data of parser.end()) {
                const outcome = parseSseEvent(data);
                recordUsageFor(model, outcome.usage);
                if (outcome.done) break;
                if (outcome.content) yield outcome.content;
            }
        }
    } catch (error) {
        throw classifyAbort(error, ctx.timedOut());
    } finally {
        ctx.cleanup();
    }
}

/** 一次性文本对话：点评、今日小结这类不需要流式的短回答。 */
export async function chatText(
    settings: AiSettings,
    messages: AiMessage[],
    signal?: AbortSignal,
    options?: { maxTokens?: number; temperature?: number },
): Promise<string> {
    const { res, model, ctx } = await performRequest(settings, messages, {
        stream: false,
        temperature: options?.temperature ?? 0.8,
        maxTokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS.text,
        signal,
    });
    try {
        if (!res.ok) throw await readError(res);
        ctx.arm(BODY_TIMEOUT_MS);
        const json = (await res.json()) as ChatResponse;
        recordUsageFor(model, json.usage);
        return json.choices?.[0]?.message?.content?.trim() ?? "";
    } catch (error) {
        throw classifyAbort(error, ctx.timedOut());
    } finally {
        ctx.cleanup();
    }
}

/** 剥掉 markdown 代码块，并尽量从文本里截出一个完整 JSON 值（对象或数组）。 */
export function parseJson<T>(content: string): T | undefined {
    const text = content
        .trim()
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/, "")
        .trim();
    try {
        return JSON.parse(text) as T;
    } catch {
        // 继续找第一个 { 或 [，配最后一个 } 或 ]
    }
    const objectStart = text.indexOf("{");
    const arrayStart = text.indexOf("[");
    let start = -1;
    let endChar = "";
    if (arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart)) {
        start = arrayStart;
        endChar = "]";
    } else if (objectStart >= 0) {
        start = objectStart;
        endChar = "}";
    }
    if (start < 0) return undefined;
    const end = text.lastIndexOf(endChar);
    if (end <= start) return undefined;
    try {
        return JSON.parse(text.slice(start, end + 1)) as T;
    } catch {
        return undefined;
    }
}

/** 没传 schema 时至少要求顶层是 JSON 对象或数组，给一个明确的格式错误。 */
const DEFAULT_JSON_SCHEMA = z.union([
    z.record(z.string(), z.unknown()),
    z.array(z.unknown()),
]);

export type ChatJsonOptions = {
    /** 可选的更强 zod schema；不传也至少用默认 schema 校验「是对象/数组」 */
    schema?: z.ZodTypeAny;
    /** 默认请求 response_format:json_object；个别不支持的服务商可关掉 */
    responseFormat?: boolean;
    maxTokens?: number;
    temperature?: number;
};

/**
 * 一次性 JSON 对话：用于批改、变式题、今日计划这类结构化结果。
 * - 有 schema 时请求 json_object，并用 zod 校验每次返回；
 * - 格式不对会带修正提示重试一次，仍不行抛清晰的 AiError。
 */
export async function chatJSON<T>(
    settings: AiSettings,
    messages: AiMessage[],
    signal?: AbortSignal,
    options?: ChatJsonOptions,
): Promise<T> {
    const jsonMode = options?.responseFormat !== false;

    const ask = async (
        list: AiMessage[],
        useJsonMode: boolean,
    ): Promise<string> => {
        const { res, model, ctx } = await performRequest(settings, list, {
            stream: false,
            temperature: options?.temperature ?? 0.3,
            maxTokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS.json,
            responseFormat: useJsonMode,
            signal,
        });
        try {
            if (!res.ok) throw await readError(res);
            ctx.arm(BODY_TIMEOUT_MS);
            const json = (await res.json()) as ChatResponse;
            recordUsageFor(model, json.usage);
            return json.choices?.[0]?.message?.content ?? "";
        } catch (error) {
            throw classifyAbort(error, ctx.timedOut());
        } finally {
            ctx.cleanup();
        }
    };

    const validate = (text: string): T | undefined => {
        const raw = parseJson<unknown>(text);
        if (raw === undefined) return undefined;
        const schema = options?.schema ?? DEFAULT_JSON_SCHEMA;
        const parsed = schema.safeParse(raw);
        return parsed.success ? (parsed.data as T) : undefined;
    };

    let content: string;
    try {
        content = await ask(messages, jsonMode);
    } catch (error) {
        // 有的服务商不认 response_format:json_object，退回普通模式再试一次。
        if (jsonMode && error instanceof AiError && error.status === 400) {
            content = await ask(messages, false);
        } else {
            throw error;
        }
    }

    let value = validate(content);
    if (value === undefined) {
        const retry = await ask(
            [
                ...messages,
                { role: "assistant", content },
                {
                    role: "user",
                    content:
                        "上一次输出不是合法 JSON。请只输出一个 JSON 对象，不要 markdown 代码块，不要解释。",
                },
            ],
            false,
        );
        value = validate(retry);
    }
    if (value === undefined) {
        throw new AiError("AI 返回的格式不对，再试一次吧");
    }
    return value;
}

/** 设置页的「测试连接」：只发一个很短的问题，也套同样的超时。 */
export async function testAiConnection(): Promise<void> {
    const url = chatEndpoint();
    if (!url) throw new AiError("AI 服务地址未初始化，刷新页面再试");
    const ctx = composeSignal(undefined, REQUEST_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({
                model: AI_MODEL,
                messages: [{ role: "user", content: "只回复：ok" }],
                stream: false,
                max_tokens: 8,
            }),
            signal: ctx.signal,
        });
        if (!res.ok) throw await readError(res);
        await res.json();
    } catch (error) {
        throw classifyAbort(error, ctx.timedOut());
    } finally {
        ctx.cleanup();
    }
}
