import { describe, expect, test } from "bun:test";

import {
    contextPercent,
    formatTokenCount,
    latestPromptTokens,
} from "./context";
import type { ChatMessage } from "./types";

function message(overrides: Partial<ChatMessage>): ChatMessage {
    return {
        id: "m1",
        conversationId: "c1",
        role: "assistant",
        parts: [],
        content: "",
        model: "deepseek-v4.1-flash",
        seq: 1,
        status: "complete",
        createdAt: "2026-01-01 00:00:00.000Z",
        ...overrides,
    };
}

describe("latestPromptTokens", () => {
    test("uses the last assistant reply with usage", () => {
        const messages = [
            message({
                id: "a1",
                seq: 2,
                usage: { prompt_tokens: 1200 },
            }),
            message({
                id: "u1",
                role: "user",
                seq: 3,
                usage: { prompt_tokens: 9999 },
            }),
            message({
                id: "a2",
                seq: 4,
                usage: { prompt_tokens: 1800 },
            }),
        ];
        expect(latestPromptTokens(messages)).toBe(1800);
    });

    test("skips replies without usage and user messages", () => {
        const messages = [
            message({ id: "a1", seq: 1, usage: { prompt_tokens: 700 } }),
            message({ id: "a2", seq: 2, status: "error" }),
        ];
        expect(latestPromptTokens(messages)).toBe(700);
    });

    test("returns 0 for an empty thread", () => {
        expect(latestPromptTokens([])).toBe(0);
    });
});

describe("contextPercent", () => {
    test("rounds and clamps", () => {
        expect(contextPercent(0, 1_000_000)).toBe(0);
        expect(contextPercent(1, 1_000_000)).toBe(1);
        expect(contextPercent(5_000, 1_000_000)).toBe(1);
        expect(contextPercent(15_000, 1_000_000)).toBe(2);
        expect(contextPercent(500_000, 1_000_000)).toBe(50);
        expect(contextPercent(1_200_000, 1_000_000)).toBe(100);
    });

    test("returns 0 when the window is unknown", () => {
        expect(contextPercent(5000, 0)).toBe(0);
        expect(contextPercent(5000, Number.NaN)).toBe(0);
    });
});

describe("formatTokenCount", () => {
    test("formats thousands and millions", () => {
        expect(formatTokenCount(0)).toBe("0");
        expect(formatTokenCount(999)).toBe("999");
        expect(formatTokenCount(1_200)).toBe("1.2k");
        expect(formatTokenCount(15_000)).toBe("15k");
        expect(formatTokenCount(1_000_000)).toBe("1M");
        expect(formatTokenCount(1_048_576)).toBe("1M");
    });
});
