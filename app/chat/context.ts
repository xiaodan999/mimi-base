import type { ChatMessage } from "./types";

/**
 * Context usage for the composer badge.
 *
 * `prompt_tokens` on the latest assistant reply is the exact context the
 * model received for that request (system prompt + persona + history +
 * tool results), so it is a better measure than counting characters.
 */
export function latestPromptTokens(messages: readonly ChatMessage[]): number {
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index];
        if (message.role !== "assistant") continue;
        const used = message.usage?.prompt_tokens;
        if (typeof used === "number" && Number.isFinite(used) && used > 0) {
            return used;
        }
    }
    return 0;
}

/** Rounded percentage, clamped to 1% for "some tokens" so it never reads 0. */
export function contextPercent(used: number, total: number): number {
    if (
        !Number.isFinite(used) ||
        !Number.isFinite(total) ||
        total <= 0 ||
        used <= 0
    ) {
        return 0;
    }
    return Math.min(100, Math.max(1, Math.round((used / total) * 100)));
}

/** 1234 -> 1.2k, 1_000_000 -> 1M, 1_048_576 -> 1M. */
export function formatTokenCount(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return "0";
    if (value >= 1_000_000) {
        const millions = value / 1_000_000;
        return `${millions >= 10 ? Math.round(millions) : millions.toFixed(1).replace(/\.0$/, "")}M`;
    }
    if (value >= 1_000) {
        const thousands = value / 1_000;
        return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1).replace(/\.0$/, "")}k`;
    }
    return String(Math.round(value));
}
