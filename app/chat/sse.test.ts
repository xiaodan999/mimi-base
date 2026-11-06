import { describe, expect, test } from "bun:test";

import { applyChatChunk, createStreamAccumulator, parseChatChunk } from "./sse";

describe("parseChatChunk", () => {
    test("reads a content delta", () => {
        const chunk = parseChatChunk(
            JSON.stringify({
                choices: [{ delta: { content: "你好" } }],
            }),
        );
        expect(chunk?.content).toBe("你好");
        expect(chunk?.done).toBe(false);
    });

    test("reads reasoning_content", () => {
        const chunk = parseChatChunk(
            JSON.stringify({
                choices: [{ delta: { reasoning_content: "想一下" } }],
            }),
        );
        expect(chunk?.reasoning).toBe("想一下");
    });

    test("accepts a non-streaming message payload", () => {
        const chunk = parseChatChunk(
            JSON.stringify({
                choices: [{ message: { content: "回答" } }],
                usage: { prompt_tokens: 3, completion_tokens: 4 },
            }),
        );
        expect(chunk?.content).toBe("回答");
        expect(chunk?.usage?.completion_tokens).toBe(4);
    });

    test("[DONE] ends the stream", () => {
        expect(parseChatChunk("[DONE]")).toEqual({
            done: true,
            toolCalls: [],
        });
    });

    test("provider errors are surfaced", () => {
        const chunk = parseChatChunk(
            JSON.stringify({ error: { message: "额度没了" } }),
        );
        expect(chunk?.error).toBe("额度没了");
    });

    test("garbage is ignored instead of throwing", () => {
        expect(parseChatChunk("not json")).toBeNull();
        expect(parseChatChunk("")).toBeNull();
    });
});

describe("applyChatChunk", () => {
    test("accumulates content and reasoning", () => {
        const acc = createStreamAccumulator();
        applyChatChunk(acc, {
            done: false,
            content: "你",
            toolCalls: [],
        });
        applyChatChunk(acc, {
            done: false,
            content: "好",
            reasoning: "先想",
            toolCalls: [],
        });
        expect(acc.content).toBe("你好");
        expect(acc.reasoning).toBe("先想");
    });

    test("assembles streamed tool-call arguments by index", () => {
        const acc = createStreamAccumulator();
        const first = parseChatChunk(
            JSON.stringify({
                choices: [
                    {
                        delta: {
                            tool_calls: [
                                {
                                    index: 0,
                                    id: "call_abc",
                                    type: "function",
                                    function: {
                                        name: "sandbox_run",
                                        arguments: '{"code":',
                                    },
                                },
                            ],
                        },
                    },
                ],
            }),
        );
        const second = parseChatChunk(
            JSON.stringify({
                choices: [
                    {
                        delta: {
                            tool_calls: [
                                {
                                    index: 0,
                                    function: { arguments: '"1+1"}' },
                                },
                            ],
                        },
                    },
                ],
            }),
        );
        applyChatChunk(acc, first!);
        applyChatChunk(acc, second!);

        expect(acc.toolCalls).toHaveLength(1);
        expect(acc.toolCalls[0]?.id).toBe("call_abc");
        expect(acc.toolCalls[0]?.name).toBe("sandbox_run");
        expect(acc.toolCalls[0]?.argsText).toBe('{"code":"1+1"}');
    });

    test("keeps parallel tool calls apart", () => {
        const acc = createStreamAccumulator();
        applyChatChunk(acc, {
            done: false,
            toolCalls: [
                {
                    index: 0,
                    id: "a",
                    function: { name: "sandbox_list", arguments: "{}" },
                },
                {
                    index: 1,
                    id: "b",
                    function: {
                        name: "sandbox_read",
                        arguments: '{"path":"x"}',
                    },
                },
            ],
        });
        expect(acc.toolCalls.map((call) => call.name)).toEqual([
            "sandbox_list",
            "sandbox_read",
        ]);
        expect(acc.toolCalls[1]?.argsText).toBe('{"path":"x"}');
    });

    test("a tool call without an index starts a new slot", () => {
        const acc = createStreamAccumulator();
        applyChatChunk(acc, {
            done: false,
            toolCalls: [
                { id: "a", function: { name: "sandbox_list", arguments: "" } },
            ],
        });
        applyChatChunk(acc, {
            done: false,
            toolCalls: [
                { id: "b", function: { name: "sandbox_run", arguments: "" } },
            ],
        });
        expect(acc.toolCalls.map((call) => call.id)).toEqual(["a", "b"]);
    });
});
