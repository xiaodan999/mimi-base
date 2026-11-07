import { describe, expect, test } from "bun:test";

import { detectInterruptedRun, INTERRUPTED_TOOL_ERROR } from "./interrupted";
import type { ChatMessage, ChatPart } from "./types";

function message(
    id: string,
    seq: number,
    overrides: Partial<ChatMessage> = {},
): ChatMessage {
    return {
        id,
        conversationId: "conv",
        role: "assistant",
        parts: [],
        content: "",
        model: "m",
        seq,
        status: "complete",
        createdAt: "",
        ...overrides,
    };
}

function userMessage(id: string, seq: number): ChatMessage {
    return message(id, seq, {
        role: "user",
        parts: [{ type: "text", text: "在吗" }],
    });
}

function toolCallPart(overrides: Partial<ChatPart> = {}): ChatPart {
    return {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "sandbox_python",
        argsText: "{}",
        ...overrides,
    } as ChatPart;
}

describe("detectInterruptedRun", () => {
    test("empty history is not interrupted", () => {
        expect(detectInterruptedRun([])).toBeNull();
    });

    test("history ending on a user message means the reply never landed", () => {
        const detected = detectInterruptedRun([userMessage("u1", 1)]);
        expect(detected).toEqual({ kind: "no-reply", anchorId: "u1" });
    });

    test("a complete tool round as the last row means the loop was killed", () => {
        const detected = detectInterruptedRun([
            userMessage("u1", 1),
            message("a1", 2, { parts: [toolCallPart()] }),
        ]);
        expect(detected).toEqual({ kind: "tools", anchorId: "a1" });
    });

    test("scan-marked interrupted tool results are still detected", () => {
        const detected = detectInterruptedRun([
            userMessage("u1", 1),
            message("a1", 2, {
                parts: [
                    toolCallPart({
                        result: { ok: false, error: INTERRUPTED_TOOL_ERROR },
                        isError: true,
                    }),
                ],
            }),
        ]);
        expect(detected).toEqual({ kind: "tools", anchorId: "a1" });
    });

    test("a terminal text reply is not interrupted", () => {
        expect(
            detectInterruptedRun([
                userMessage("u1", 1),
                message("a1", 2, {
                    parts: [{ type: "text", text: "在的" }],
                    content: "在的",
                }),
            ]),
        ).toBeNull();
    });

    test("an explicit stop is not an interruption", () => {
        expect(
            detectInterruptedRun([
                userMessage("u1", 1),
                message("a1", 2, {
                    parts: [{ type: "text", text: "写到一半" }],
                    status: "stopped",
                }),
            ]),
        ).toBeNull();
        expect(
            detectInterruptedRun([
                userMessage("u1", 1),
                message("a1", 2, {
                    parts: [toolCallPart()],
                    status: "stopped",
                }),
            ]),
        ).toBeNull();
    });

    test("a stream error row is already surfaced by 重新生成", () => {
        expect(
            detectInterruptedRun([
                userMessage("u1", 1),
                message("a1", 2, { status: "error", error: "网络断了" }),
            ]),
        ).toBeNull();
    });

    test("uses the actual last row, not the deepest tool round", () => {
        const detected = detectInterruptedRun([
            userMessage("u1", 1),
            message("a1", 2, { parts: [toolCallPart()] }),
            message("a2", 3, {
                parts: [{ type: "text", text: "完成了" }],
                content: "完成了",
            }),
        ]);
        expect(detected).toBeNull();
    });
});
