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

describe("buildApiMessages with attachments", () => {
    const attachmentPart = {
        type: "attachment" as const,
        attachmentId: "att1",
        collectionId: "col1",
        file: "contract.pdf",
        name: "订货合同.pdf",
        mime: "application/pdf",
        size: 100,
        kind: "pdf" as const,
        pageCount: 12,
        truncated: false,
        extracted: "第一条 甲方……",
        pageImages: ["data:image/jpeg;base64,AA"],
    };

    test("the newest attachment turn expands text plus page images", () => {
        const result = buildApiMessages(
            [
                message({
                    parts: [{ type: "text", text: "这是什么" }, attachmentPart],
                }),
            ],
            "",
        );
        const user = result[1] as {
            role: string;
            content: { type: string; text?: string }[];
        };
        expect(user.role).toBe("user");
        expect(user.content[0]).toMatchObject({ type: "text" });
        const text = (user.content[0] as { text: string }).text;
        expect(text).toContain("[附件 订货合同.pdf（PDF，共 12 页）]");
        expect(text).toContain("第一条 甲方……");
        expect(user.content[1]).toMatchObject({
            type: "image_url",
            image_url: { url: "data:image/jpeg;base64,AA" },
        });
        expect(user.content).toHaveLength(2);
    });

    test("older attachment turns collapse to a read_attachment stub", () => {
        const result = buildApiMessages(
            [
                message({ id: "u1", seq: 1, parts: [attachmentPart] }),
                message({
                    id: "a1",
                    seq: 2,
                    role: "assistant",
                    parts: [{ type: "text", text: "答复" }],
                }),
                message({
                    id: "u2",
                    seq: 3,
                    parts: [
                        { type: "text", text: "再看看这份" },
                        attachmentPart,
                    ],
                }),
            ],
            "",
        );
        // u2 is the newest attachment turn and keeps its full content; u1
        // collapses so history stays bounded.
        const stub = (result[1] as { content: string }).content;
        expect(stub).toContain("已省略");
        expect(stub).toContain("read_attachment");
        expect(stub).toContain("attachmentId: att1");
        expect(stub).not.toContain("第一条 甲方……");
        expect(JSON.stringify(result[1])).not.toContain("data:image/jpeg");
        const full = result[3] as {
            role: string;
            content: { type: string }[];
        };
        expect(full.role).toBe("user");
        expect(full.content).toHaveLength(2);
    });

    test("read_attachment results keep the full text and append page images as a user turn", () => {
        const result = buildApiMessages(
            [
                message({
                    role: "assistant",
                    parts: [
                        {
                            type: "tool-call",
                            toolCallId: "call_1",
                            toolName: "read_attachment",
                            argsText:
                                '{"attachmentId":"att1","mode":"pages","pages":"2-3"}',
                            result: { ok: true, pages: [2, 3] },
                            resultImages: ["data:image/jpeg;base64,AA"],
                        },
                        { type: "text", text: "这两页写了……" },
                    ],
                }),
            ],
            "",
        );
        const tool = result[2] as { role: string; content: string };
        expect(tool.role).toBe("tool");
        expect(tool.content).toContain('"pages":[2,3]');
        expect(tool.content).not.toContain("data:image");
        const synthetic = result[3] as {
            role: string;
            content: { type: string }[];
        };
        expect(synthetic.role).toBe("user");
        expect(synthetic.content[0]).toMatchObject({ type: "text" });
        expect(synthetic.content[1]).toMatchObject({
            type: "image_url",
            image_url: { url: "data:image/jpeg;base64,AA" },
        });
    });

    test("a long read_attachment text result is capped at the attachment limit, not 12k", () => {
        const longText = "x".repeat(30_000);
        const result = buildApiMessages(
            [
                message({
                    role: "assistant",
                    parts: [
                        {
                            type: "tool-call",
                            toolCallId: "call_1",
                            toolName: "read_attachment",
                            argsText: '{"attachmentId":"att1","mode":"text"}',
                            result: { ok: true, content: longText },
                        },
                        { type: "text", text: "读完" },
                    ],
                }),
            ],
            "",
        );
        const tool = result[2] as { content: string };
        expect(tool.content.length).toBeGreaterThan(20_000);
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
