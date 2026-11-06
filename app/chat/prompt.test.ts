import { describe, expect, test } from "bun:test";

import { buildApiMessages, buildSystemPrompt, toolResultText } from "./prompt";
import type { ChatMessage } from "./types";

function message(overrides: Partial<ChatMessage>): ChatMessage {
    return {
        id: "m1",
        conversationId: "c1",
        role: "user",
        parts: [],
        content: "",
        model: "m",
        seq: 1,
        status: "complete",
        createdAt: "2026-01-01 00:00:00.000Z",
        ...overrides,
    };
}

describe("buildSystemPrompt", () => {
    test("includes the persona snapshot", () => {
        const prompt = buildSystemPrompt("你是一位翻译。");
        expect(prompt).toContain("翻译");
        expect(prompt).toContain("mimi-base");
    });

    test("base prompt survives an empty persona", () => {
        expect(buildSystemPrompt("  ")).toContain("mimi-base");
    });
});

describe("buildApiMessages", () => {
    test("puts the system prompt first", () => {
        const result = buildApiMessages([], "人格设定");
        expect(result[0]).toMatchObject({ role: "system" });
        expect((result[0] as { content: string }).content).toContain(
            "人格设定",
        );
    });

    test("user images become image_url parts", () => {
        const result = buildApiMessages(
            [
                message({
                    parts: [
                        { type: "text", text: "这是什么" },
                        { type: "image", image: "data:image/jpeg;base64,AA" },
                    ],
                }),
            ],
            "",
        );
        const user = result[1] as {
            role: string;
            content: { type: string }[];
        };
        expect(user.role).toBe("user");
        expect(user.content[0]).toMatchObject({
            type: "text",
            text: "这是什么",
        });
        expect(user.content[1]).toMatchObject({
            type: "image_url",
            image_url: { url: "data:image/jpeg;base64,AA" },
        });
    });

    test("reasoning is not sent back to the model", () => {
        const result = buildApiMessages(
            [
                message({
                    role: "assistant",
                    parts: [
                        { type: "reasoning", text: "内部推理" },
                        { type: "text", text: "回答" },
                    ],
                }),
            ],
            "",
        );
        expect(JSON.stringify(result)).not.toContain("内部推理");
        expect(result[1]).toEqual({ role: "assistant", content: "回答" });
    });

    test("tool calls are replayed with their results", () => {
        const result = buildApiMessages(
            [
                message({
                    role: "assistant",
                    parts: [
                        {
                            type: "tool-call",
                            toolCallId: "call_1",
                            toolName: "sandbox_run",
                            argsText: '{"code":"1+1"}',
                            result: { ok: true, result: 2 },
                        },
                        { type: "text", text: "结果是 2" },
                    ],
                }),
            ],
            "",
        );
        const assistant = result[1] as {
            role: string;
            content: string;
            tool_calls: {
                id: string;
                function: { name: string; arguments: string };
            }[];
        };
        expect(assistant.role).toBe("assistant");
        expect(assistant.content).toBe("结果是 2");
        expect(assistant.tool_calls[0]).toMatchObject({
            id: "call_1",
            type: "function",
            function: { name: "sandbox_run", arguments: '{"code":"1+1"}' },
        });
        expect(result[2]).toMatchObject({
            role: "tool",
            tool_call_id: "call_1",
        });
        expect((result[2] as { content: string }).content).toContain(
            '"result":2',
        );
    });

    test("drops calls that never got a result", () => {
        const result = buildApiMessages(
            [
                message({
                    role: "assistant",
                    parts: [
                        {
                            type: "tool-call",
                            toolCallId: "call_1",
                            toolName: "sandbox_run",
                            argsText: "{}",
                        },
                    ],
                }),
            ],
            "",
        );
        expect(result).toHaveLength(2);
        expect(result[1]).toMatchObject({ role: "assistant" });
        expect((result[1] as { tool_calls?: unknown }).tool_calls).toEqual([
            expect.objectContaining({ id: "call_1" }),
        ]);
        expect(result.some((item) => item.role === "tool")).toBe(false);
    });

    test("trimming never starts the history on a tool result", () => {
        const messages: ChatMessage[] = [
            message({
                id: "u1",
                seq: 1,
                role: "user",
                parts: [{ type: "text", text: "旧问题" }],
            }),
            message({
                id: "a1",
                seq: 2,
                role: "assistant",
                parts: [
                    {
                        type: "tool-call",
                        toolCallId: "call_1",
                        toolName: "sandbox_list",
                        argsText: "{}",
                        result: { ok: true },
                    },
                ],
            }),
            message({
                id: "u2",
                seq: 3,
                role: "user",
                parts: [{ type: "text", text: "新问题" }],
            }),
        ];
        const result = buildApiMessages(messages, "", { maxHistory: 2 });
        expect(result[1]).toMatchObject({ role: "user", content: "新问题" });
    });

    test("skips empty turns", () => {
        const result = buildApiMessages(
            [message({ parts: [] }), message({ role: "assistant", parts: [] })],
            "",
        );
        expect(result).toHaveLength(1);
    });
});

describe("toolResultText", () => {
    test("keeps strings and serializes objects", () => {
        expect(toolResultText("hi")).toBe("hi");
        expect(toolResultText({ a: 1 })).toBe('{"a":1}');
    });

    test("caps runaway output", () => {
        const text = toolResultText("x".repeat(100), 10);
        expect(text).toHaveLength(11);
        expect(text.endsWith("…")).toBe(true);
    });
});
