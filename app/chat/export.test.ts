import { describe, expect, test } from "bun:test";

import {
    filterConversations,
    listPersonaChips,
    sortConversations,
} from "./conversations";
import { conversationToMarkdown, markdownFilename } from "./export";
import type { ChatConversation, ChatMessage } from "./types";

function conversation(
    overrides: Partial<ChatConversation> = {},
): ChatConversation {
    return {
        id: "c1",
        title: "周末计划",
        model: "deepseek-v4.1-flash",
        thinking: "",
        personaId: "builtin:general",
        personaName: "日常对话",
        personaPrompt: "p",
        sandboxFiles: {},
        lastMessage: "好的",
        pinned: false,
        createdAt: "2026-11-07 10:00:00.000Z",
        updatedAt: "2026-11-07 10:00:00.000Z",
        ...overrides,
    };
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
    return {
        id: "m1",
        conversationId: "c1",
        role: "user",
        parts: [{ type: "text", text: "你好" }],
        content: "你好",
        model: "deepseek-v4.1-flash",
        seq: 1,
        status: "complete",
        createdAt: "2026-11-07 10:00:00.000Z",
        ...overrides,
    };
}

describe("conversationToMarkdown", () => {
    test("keeps text, summarizes tool calls, placeholders images", () => {
        const markdown = conversationToMarkdown(conversation(), [
            message({
                parts: [
                    { type: "text", text: "看这个" },
                    { type: "image", image: "data:image/jpeg;base64,xx" },
                ],
            }),
            message({
                id: "m2",
                role: "assistant",
                seq: 2,
                parts: [
                    { type: "reasoning", text: "thinking" },
                    {
                        type: "tool-call",
                        toolCallId: "t1",
                        toolName: "get_expenses",
                        argsText: "{}",
                    },
                    { type: "text", text: "本月一共 500 元" },
                ],
            }),
            message({
                id: "m3",
                role: "assistant",
                seq: 3,
                status: "error",
                error: "超时",
                parts: [],
            }),
        ]);
        expect(markdown).toContain("# 周末计划");
        expect(markdown).toContain("> 应用场景：日常对话");
        expect(markdown).toContain("### 我");
        expect(markdown).toContain("看这个");
        expect(markdown).toContain("[图片]");
        expect(markdown).toContain("> 查账本");
        expect(markdown).toContain("本月一共 500 元");
        expect(markdown).toContain("> 出错：超时");
        // reasoning is display-only and must not leak into the export
        expect(markdown).not.toContain("thinking");
    });

    test("includes a render_ui card title and tolerates partial args", () => {
        const markdown = conversationToMarkdown(conversation(), [
            message({
                role: "assistant",
                parts: [
                    {
                        type: "tool-call",
                        toolCallId: "t1",
                        toolName: "render_ui",
                        argsText: JSON.stringify({
                            title: " 本月小结 ",
                            blocks: [{ type: "divider" }],
                        }),
                    },
                    {
                        type: "tool-call",
                        toolCallId: "t2",
                        toolName: "render_ui",
                        argsText: '{"title":"还没写完',
                    },
                ],
            }),
        ]);
        expect(markdown).toContain("> 生成卡片：本月小结");
        expect(markdown).toContain("> 生成卡片\n");
    });

    test("sanitizes filenames", () => {
        expect(markdownFilename('周末/计划: v2?"')).toBe("周末计划 v2.md");
        expect(markdownFilename("")).toBe("对话.md");
    });
});

describe("list helpers", () => {
    test("pinned conversations sort first, newest within groups", () => {
        const sorted = sortConversations([
            conversation({ id: "a", updatedAt: "2026-11-07 09:00:00.000Z" }),
            conversation({
                id: "b",
                pinned: true,
                updatedAt: "2026-11-07 08:00:00.000Z",
            }),
            conversation({
                id: "c",
                pinned: true,
                updatedAt: "2026-11-07 10:00:00.000Z",
            }),
        ]);
        expect(sorted.map((row) => row.id)).toEqual(["c", "b", "a"]);
    });

    test("filters by query and persona", () => {
        const list = [
            conversation({ id: "a", title: "报销问题" }),
            conversation({
                id: "b",
                title: "english",
                personaId: "builtin:english-teacher",
                personaName: "英语学习",
            }),
        ];
        expect(
            filterConversations(list, "报销", "all").map((row) => row.id),
        ).toEqual(["a"]);
        expect(
            filterConversations(list, "", "builtin:english-teacher").map(
                (row) => row.id,
            ),
        ).toEqual(["b"]);
        expect(filterConversations(list, "没有的", "all")).toEqual([]);
    });

    test("chips use the resolved persona and fall back to the snapshot", () => {
        const chips = listPersonaChips(
            [
                conversation({ personaId: "builtin:general" }),
                conversation({ personaId: "builtin:general" }),
                conversation({
                    personaId: "builtin:removed",
                    personaName: "已删除场景",
                }),
            ],
            [
                {
                    id: "builtin:general",
                    name: "日常对话",
                    icon: "✨",
                    description: "",
                    prompt: "",
                    builtin: true,
                },
            ],
        );
        expect(chips[0]).toMatchObject({
            id: "builtin:general",
            name: "日常对话",
            icon: "✨",
            count: 2,
        });
        expect(chips[1]).toMatchObject({
            id: "builtin:removed",
            name: "已删除场景",
            icon: "💬",
            count: 1,
        });
    });
});
