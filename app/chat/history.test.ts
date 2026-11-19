import { describe, expect, test } from "bun:test";

import { appendUniqueMessage } from "./history";
import type { ChatMessage } from "./types";

function message(id: string, content: string, seq: number): ChatMessage {
    return {
        id,
        conversationId: "conversation",
        role: "user",
        parts: [{ type: "text", text: content }],
        content,
        model: "model",
        seq,
        status: "complete",
        createdAt: "2026-11-19 10:00:00.000Z",
    };
}

describe("appendUniqueMessage", () => {
    test("appends a message that is not in the history", () => {
        const first = message("m1", "第一句", 1);
        const second = message("m2", "第二句", 2);
        expect(appendUniqueMessage([first], second)).toEqual([first, second]);
    });

    test("keeps one copy when the row is already in the history", () => {
        const first = message("m1", "第一句", 1);
        const second = message("m2", "第二句", 2);
        expect(appendUniqueMessage([first, second], second)).toEqual([
            first,
            second,
        ]);
    });

    test("keeps deliberate repeats with different ids", () => {
        const first = message("m1", "同一句话", 1);
        const again = message("m2", "同一句话", 2);
        expect(appendUniqueMessage([first], again)).toEqual([first, again]);
    });

    test("does not mutate the input history", () => {
        const first = message("m1", "第一句", 1);
        const second = message("m2", "第二句", 2);
        const history = [first];
        const next = appendUniqueMessage(history, second);
        expect(next).toEqual([first, second]);
        expect(next).not.toBe(history);
        expect(history).toEqual([first]);
    });
});
