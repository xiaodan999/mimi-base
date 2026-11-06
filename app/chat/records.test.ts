import { describe, expect, test } from "bun:test";

import {
    messageText,
    normalizeParts,
    normalizeSandboxFiles,
    previewText,
    toChatConversation,
    toChatMessage,
} from "./records";

describe("normalizeParts", () => {
    test("keeps valid text, reasoning, image and tool parts", () => {
        const parts = normalizeParts([
            { type: "text", text: "回答" },
            { type: "reasoning", text: "思考" },
            { type: "image", image: "data:image/jpeg;base64,AA" },
            {
                type: "tool-call",
                toolCallId: "call_1",
                toolName: "sandbox_run",
                argsText: '{"code":"1"}',
                result: { ok: true },
            },
        ]);
        expect(parts.map((part) => part.type)).toEqual([
            "text",
            "reasoning",
            "image",
            "tool-call",
        ]);
    });

    test("drops junk and non-image data urls", () => {
        const parts = normalizeParts([
            { type: "text", text: "" },
            { type: "image", image: "https://evil.example/x.png" },
            { type: "tool-call" },
            { type: "unknown" },
            null,
            "x",
        ]);
        expect(parts).toEqual([]);
    });

    test("parses a JSON string field", () => {
        expect(normalizeParts('[{"type":"text","text":"hi"}]')).toEqual([
            { type: "text", text: "hi" },
        ]);
    });

    test("gives a tool call without an id a stable fallback", () => {
        const parts = normalizeParts([
            {
                type: "tool-call",
                toolName: "sandbox_list",
                argsText: "{}",
            },
        ]);
        expect(parts[0]).toMatchObject({ toolCallId: "call-0" });
    });
});

describe("messageText", () => {
    test("joins text parts only", () => {
        expect(
            messageText([
                { type: "text", text: "a" },
                { type: "reasoning", text: "hidden" },
                { type: "text", text: "b" },
            ]),
        ).toBe("a\n\nb");
    });
});

describe("normalizeSandboxFiles", () => {
    test("caps each file and skips non-strings", () => {
        const files = normalizeSandboxFiles({
            "a.txt": "x".repeat(300_000),
            "b.txt": 5,
        });
        expect(files["a.txt"]?.length).toBe(200_000);
        expect(files["b.txt"]).toBeUndefined();
    });
});

describe("toChatConversation", () => {
    test("maps a PocketBase record", () => {
        const conversation = toChatConversation({
            id: "c1",
            owner: "u1",
            title: "标题",
            model: "m",
            persona_id: "builtin:general",
            persona_name: "通用助手",
            persona_prompt: "设定",
            sandbox_files: { "a.txt": "1" },
            last_message: "预览",
            created: "2026-01-01 00:00:00.000Z",
            updated: "2026-01-02 00:00:00.000Z",
        });
        expect(conversation).toMatchObject({
            id: "c1",
            title: "标题",
            personaName: "通用助手",
            sandboxFiles: { "a.txt": "1" },
        });
    });

    test("falls back for an empty title", () => {
        const conversation = toChatConversation({
            id: "c1",
            owner: "u1",
            title: "",
            model: "m",
            created: "",
            updated: "",
        });
        expect(conversation.title).toBe("新对话");
        expect(conversation.sandboxFiles).toEqual({});
    });
});

describe("toChatMessage", () => {
    test("maps role, status, usage and text", () => {
        const message = toChatMessage({
            id: "m1",
            conversation: "c1",
            role: "assistant",
            status: "stopped",
            parts: [{ type: "text", text: "半句" }],
            content: "",
            model: "model",
            seq: 4,
            usage: { prompt_tokens: 1.4, completion_tokens: 2 },
            created: "2026-01-01 00:00:00.000Z",
        });
        expect(message.role).toBe("assistant");
        expect(message.status).toBe("stopped");
        expect(message.content).toBe("半句");
        expect(message.usage).toEqual({
            prompt_tokens: 1,
            completion_tokens: 2,
        });
    });

    test("defaults unknown roles to user", () => {
        const message = toChatMessage({
            id: "m1",
            conversation: "c1",
            role: "system",
            created: "",
        });
        expect(message.role).toBe("user");
        expect(message.seq).toBe(0);
    });
});

describe("previewText", () => {
    test("compacts whitespace and markdown", () => {
        expect(previewText("## 标题\n\n**正文**")).toBe("标题 正文");
    });

    test("truncates", () => {
        expect(previewText("x".repeat(30), 10)).toHaveLength(10);
    });
});
