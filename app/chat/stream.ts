import { createSseParser } from "@/app/ai/client";

import { aiUrl, ChatApiError, chatHeaders, readChatError } from "./api";
import {
    type AccumulatedToolCall,
    applyChatChunk,
    createStreamAccumulator,
    parseChatChunk,
} from "./sse";
import type { ChatUsage } from "./types";

const CONNECT_TIMEOUT_MS = 60_000;
/** Long answers can pause between tokens; only silence counts as a timeout. */
const IDLE_TIMEOUT_MS = 120_000;
/** Tool calls carry whole files in their arguments; 4k truncated them. */
const MAX_TOKENS = 8192;

export type ChatToolDefinition = {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
};

export type StreamSnapshot = {
    content: string;
    reasoning: string;
    toolCalls: AccumulatedToolCall[];
};

export type StreamChatOptions = {
    model: string;
    messages: unknown[];
    /** "" = provider default, otherwise low / high / max. */
    reasoningEffort?: string;
    tools?: ChatToolDefinition[];
    signal?: AbortSignal;
    temperature?: number;
    maxTokens?: number;
    /** Called after every chunk with the full text/tool-call state so far. */
    onDelta?: (snapshot: StreamSnapshot) => void;
};

export type StreamChatResult = StreamSnapshot & {
    usage?: ChatUsage;
    /** OpenAI `finish_reason`; `length` means the output hit the token cap. */
    finishReason?: string;
    /** True when the caller cancelled; partial content is still returned. */
    aborted: boolean;
};

function isAbort(error: unknown): boolean {
    return (
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError")
    );
}

/**
 * One streaming request with tool calls and reasoning deltas.
 *
 * The relay owns the model allowlist and the API key; this function only
 * sends the PocketBase token. Cancellation returns the partial result instead
 * of throwing so the caller can persist a stopped message.
 */
export async function streamChatCompletion(
    options: StreamChatOptions,
): Promise<StreamChatResult> {
    const acc = createStreamAccumulator();
    let usage: ChatUsage | undefined;

    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const arm = (ms: number) => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        if (ms > 0) {
            timer = setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, ms);
        }
    };
    const onCallerAbort = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    else
        options.signal?.addEventListener("abort", onCallerAbort, {
            once: true,
        });

    const snapshot = (aborted: boolean): StreamChatResult => ({
        content: acc.content,
        reasoning: acc.reasoning,
        toolCalls: acc.toolCalls.filter((call) => call.name !== ""),
        ...(acc.finishReason ? { finishReason: acc.finishReason } : {}),
        ...(usage ? { usage } : {}),
        aborted,
    });
    const publish = () =>
        options.onDelta?.({
            content: acc.content,
            reasoning: acc.reasoning,
            toolCalls: acc.toolCalls.filter((call) => call.name !== ""),
        });

    try {
        arm(CONNECT_TIMEOUT_MS);
        let res: Response;
        try {
            res = await fetch(aiUrl("/chat/completions"), {
                method: "POST",
                headers: chatHeaders(),
                body: JSON.stringify({
                    model: options.model,
                    messages: options.messages,
                    stream: true,
                    stream_options: { include_usage: true },
                    temperature: options.temperature ?? 0.7,
                    max_tokens: options.maxTokens ?? MAX_TOKENS,
                    ...(options.reasoningEffort
                        ? { reasoning_effort: options.reasoningEffort }
                        : {}),
                    ...(options.tools && options.tools.length > 0
                        ? { tools: options.tools, tool_choice: "auto" }
                        : {}),
                }),
                signal: controller.signal,
            });
        } catch (error) {
            if (options.signal?.aborted) return snapshot(true);
            if (timedOut) {
                throw new ChatApiError("AI 响应超时了，稍后再试");
            }
            if (isAbort(error)) return snapshot(true);
            throw new ChatApiError(
                "请求没发出去：可能是网络问题，或站点的 /ai 代理没有配置好。",
            );
        }
        arm(0);

        if (!res.ok) throw await readChatError(res);

        const type = res.headers.get("content-type") ?? "";
        if (!type.includes("event-stream") || !res.body) {
            const json = (await res.json()) as unknown;
            const chunk = parseChatChunk(JSON.stringify(json));
            if (chunk?.error) throw new ChatApiError(chunk.error);
            if (chunk) {
                applyChatChunk(acc, chunk);
                usage = chunk.usage ?? usage;
                publish();
            }
            return snapshot(false);
        }

        arm(IDLE_TIMEOUT_MS);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = createSseParser();

        const handleData = (data: string): boolean => {
            const chunk = parseChatChunk(data);
            if (!chunk) return false;
            if (chunk.error) {
                throw new ChatApiError(`AI 返回出错：${chunk.error}`);
            }
            if (chunk.usage) usage = chunk.usage;
            if (chunk.done) return true;
            applyChatChunk(acc, chunk);
            publish();
            return false;
        };

        let finished = false;
        while (!finished) {
            let done = false;
            let value: Uint8Array | undefined;
            try {
                const read = await reader.read();
                done = read.done;
                value = read.value;
            } catch (error) {
                if (options.signal?.aborted) return snapshot(true);
                if (timedOut) {
                    throw new ChatApiError("AI 响应超时了，稍后再试");
                }
                if (isAbort(error)) return snapshot(true);
                throw new ChatApiError("AI 连接中断了，稍后再试");
            }
            if (done) break;
            arm(IDLE_TIMEOUT_MS);
            for (const data of parser.push(
                decoder.decode(value, { stream: true }),
            )) {
                if (handleData(data)) {
                    finished = true;
                    break;
                }
            }
            if (finished) {
                await reader.cancel().catch(() => {});
                break;
            }
        }

        if (!finished) {
            for (const data of parser.end()) {
                if (handleData(data)) break;
            }
        }

        return snapshot(false);
    } finally {
        if (timer !== null) clearTimeout(timer);
        options.signal?.removeEventListener("abort", onCallerAbort);
    }
}
