import type { ChatUsage } from "./types";

/**
 * SSE decoding for OpenAI-compatible chat completions with tool calls and
 * reasoning. Pure functions so `bun test` can cover the tricky parts without
 * a server: delta accumulation, `[DONE]`, and partial tool-call arguments.
 */

export type RawToolCallDelta = {
    index?: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
};

export type ChatChunk = {
    done: boolean;
    content?: string;
    reasoning?: string;
    toolCalls: RawToolCallDelta[];
    usage?: ChatUsage;
    /** OpenAI `finish_reason` (`stop` / `length` / `tool_calls`, ...). */
    finishReason?: string;
    error?: string;
};

type DeltaLike = {
    content?: unknown;
    reasoning_content?: unknown;
    reasoning?: unknown;
    tool_calls?: unknown;
};

function textOf(value: unknown): string | undefined {
    return typeof value === "string" && value !== "" ? value : undefined;
}

function usageOf(value: unknown): ChatUsage | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const usage: ChatUsage = {};
    for (const key of [
        "prompt_tokens",
        "completion_tokens",
        "total_tokens",
    ] as const) {
        const number = (value as Record<string, unknown>)[key];
        if (typeof number === "number" && Number.isFinite(number)) {
            usage[key] = Math.max(0, Math.round(number));
        }
    }
    return Object.keys(usage).length > 0 ? usage : undefined;
}

function toolCallsOf(value: unknown): RawToolCallDelta[] {
    if (!Array.isArray(value)) return [];
    const calls: RawToolCallDelta[] = [];
    for (const raw of value) {
        if (typeof raw !== "object" || raw === null) continue;
        const record = raw as Record<string, unknown>;
        const fn =
            typeof record.function === "object" && record.function !== null
                ? (record.function as Record<string, unknown>)
                : undefined;
        const call: RawToolCallDelta = {};
        if (typeof record.index === "number" && Number.isFinite(record.index)) {
            call.index = Math.max(0, Math.round(record.index));
        }
        if (typeof record.id === "string" && record.id !== "") {
            call.id = record.id;
        }
        if (typeof record.type === "string" && record.type !== "") {
            call.type = record.type;
        }
        if (fn) {
            const name = textOf(fn.name);
            const args = textOf(fn.arguments);
            if (name || args) {
                call.function = {
                    ...(name ? { name } : {}),
                    ...(args ? { arguments: args } : {}),
                };
            }
        }
        if (call.id || call.function || call.index !== undefined) {
            calls.push(call);
        }
    }
    return calls;
}

/** Parse one SSE `data:` payload. Returns `null` for noise we can ignore. */
export function parseChatChunk(data: string): ChatChunk | null {
    const trimmed = data.trim();
    if (trimmed === "") return null;
    if (trimmed === "[DONE]") return { done: true, toolCalls: [] };

    let json: unknown;
    try {
        json = JSON.parse(trimmed);
    } catch {
        return null;
    }
    if (typeof json !== "object" || json === null) return null;
    const payload = json as Record<string, unknown>;

    if (payload.error) {
        const error = payload.error;
        const message =
            typeof error === "string"
                ? error
                : typeof error === "object" &&
                    error !== null &&
                    typeof (error as { message?: unknown }).message === "string"
                  ? String((error as { message: string }).message)
                  : "未知错误";
        return { done: false, toolCalls: [], error: message };
    }

    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const first =
        typeof choices[0] === "object" && choices[0] !== null
            ? (choices[0] as Record<string, unknown>)
            : undefined;
    const delta =
        typeof first?.delta === "object" && first.delta !== null
            ? (first.delta as DeltaLike)
            : typeof first?.message === "object" && first.message !== null
              ? (first.message as DeltaLike)
              : undefined;

    return {
        done: false,
        ...(textOf(delta?.content) ? { content: textOf(delta?.content) } : {}),
        ...((textOf(delta?.reasoning_content) ?? textOf(delta?.reasoning))
            ? {
                  reasoning:
                      textOf(delta?.reasoning_content) ??
                      textOf(delta?.reasoning),
              }
            : {}),
        toolCalls: toolCallsOf(delta?.tool_calls),
        ...(textOf(first?.finish_reason)
            ? { finishReason: textOf(first?.finish_reason) }
            : {}),
        ...(usageOf(payload.usage) ? { usage: usageOf(payload.usage) } : {}),
    };
}

export type AccumulatedToolCall = {
    id: string;
    name: string;
    argsText: string;
};

export type StreamAccumulator = {
    content: string;
    reasoning: string;
    toolCalls: AccumulatedToolCall[];
    /** Last non-null `finish_reason` seen; `length` means the output was cut. */
    finishReason?: string;
};

export function createStreamAccumulator(): StreamAccumulator {
    return { content: "", reasoning: "", toolCalls: [] };
}

/**
 * Merge one chunk into the accumulator. Returns what the UI should append.
 * Tool-call arguments arrive as fragments keyed by `index`; an entry may be
 * created by a chunk that only carries the id/name, then filled by later
 * chunks, so the UI re-renders the same card each time.
 */
export function applyChatChunk(
    acc: StreamAccumulator,
    chunk: ChatChunk,
): {
    contentDelta: string;
    reasoningDelta: string;
    toolCallsChanged: boolean;
} {
    if (chunk.content) acc.content += chunk.content;
    if (chunk.reasoning) acc.reasoning += chunk.reasoning;
    if (chunk.finishReason) acc.finishReason = chunk.finishReason;

    let toolCallsChanged = false;
    let fallbackIndex = acc.toolCalls.length;
    for (const delta of chunk.toolCalls) {
        const index = delta.index ?? fallbackIndex;
        fallbackIndex = Math.max(fallbackIndex, index + 1);
        while (acc.toolCalls.length <= index) {
            acc.toolCalls.push({ id: "", name: "", argsText: "" });
        }
        const target = acc.toolCalls[index]!;
        if (delta.id) target.id = delta.id;
        if (delta.function?.name) target.name = delta.function.name;
        if (delta.function?.arguments) {
            target.argsText += delta.function.arguments;
        }
        toolCallsChanged = true;
    }

    return {
        contentDelta: chunk.content ?? "",
        reasoningDelta: chunk.reasoning ?? "",
        toolCallsChanged,
    };
}
