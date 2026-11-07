import { describe, expect, test } from "bun:test";

import {
    messageText,
    normalizeParts,
    normalizeSandboxFiles,
    previewText,
    toChatConversation,
    toChatMessage,
} from "./records";
import type { ChatAttachmentPart } from "./types";

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

describe("attachment parts", () => {
    const valid: ChatAttachmentPart = {
        type: "attachment",
        attachmentId: "att1",
        collectionId: "col1",
        file: "contract_abc.pdf",
        name: "订货合同.pdf",
        mime: "application/pdf",
        size: 2048,
        kind: "pdf",
        pageCount: 12,
        truncated: false,
        extracted: "第一条",
        pageImages: ["data:image/jpeg;base64,AA"],
    };

    test("keeps a well-formed attachment part", () => {
        expect(normalizeParts([valid])).toEqual([valid]);
    });

    test("drops parts without a record reference or name", () => {
        expect(
            normalizeParts([
                { ...valid, attachmentId: "" },
                { ...valid, file: "" },
                { ...valid, name: "" },
            ]),
        ).toEqual([]);
    });

    test("filters junk page images, defaults mime, bounds fields", () => {
        const parts = normalizeParts([
            {
                ...valid,
                mime: "",
                size: -5,
                pageCount: 1.5,
                pageImages: ["https://evil.example/x.jpg", "nope"],
                extracted: "x".repeat(60_000),
            },
        ]);
        expect(parts).toHaveLength(1);
        const part = parts[0] as {
            mime: string;
            size: number;
            pageCount?: number;
            pageImages: string[];
            extracted: string;
        };
        expect(part.mime).toBe("application/pdf");
        expect(part.size).toBe(0);
        expect(part.pageCount).toBeUndefined();
        expect(part.pageImages).toEqual([]);
        expect(part.extracted).toHaveLength(50_000);
    });

    test("tool calls keep validated resultImages", () => {
        const parts = normalizeParts([
            {
                type: "tool-call",
                toolCallId: "call_1",
                toolName: "read_attachment",
                argsText: "{}",
                result: { ok: true },
                resultImages: [
                    "data:image/jpeg;base64,AA",
                    "data:image/jpeg;base64,BB",
                    "junk",
                ],
            },
        ]);
        expect(parts[0]).toMatchObject({
            resultImages: [
                "data:image/jpeg;base64,AA",
                "data:image/jpeg;base64,BB",
            ],
        });
    });
});

describe("artifact parts", () => {
    test("keeps valid sandbox and uploaded artifacts", () => {
        const parts = normalizeParts([
            {
                type: "artifact",
                source: "sandbox",
                path: "out/invoice.html",
                name: "invoice.html",
                mime: "text/html",
                caption: "本月账单",
            },
            {
                type: "artifact",
                source: "file",
                artifactId: "art123",
                collectionId: "col456",
                file: "chart_abc.png",
                name: "chart.png",
                mime: "image/png",
                size: 2048,
            },
        ]);
        expect(parts).toHaveLength(2);
        expect(parts[0]).toMatchObject({
            type: "artifact",
            source: "sandbox",
            path: "out/invoice.html",
            caption: "本月账单",
        });
        expect(parts[1]).toMatchObject({
            type: "artifact",
            source: "file",
            artifactId: "art123",
            file: "chart_abc.png",
            size: 2048,
        });
    });

    test("drops escaping paths and incomplete uploads", () => {
        expect(
            normalizeParts([
                {
                    type: "artifact",
                    source: "sandbox",
                    path: "../secret.html",
                },
                {
                    type: "artifact",
                    source: "file",
                    artifactId: "art123",
                    file: "x.png",
                },
                {
                    type: "artifact",
                    source: "file",
                    artifactId: "art123",
                    collectionId: "col456",
                    file: "x.png",
                    size: 99_000_000,
                },
                { type: "artifact", source: "cloud" },
            ]),
        ).toEqual([]);
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
            thinking: "",
        });
    });

    test("maps the thinking level", () => {
        const conversation = toChatConversation({
            id: "c1",
            owner: "u1",
            title: "标题",
            model: "m",
            thinking: "high",
            created: "",
            updated: "",
        });
        expect(conversation.thinking).toBe("high");
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
        expect(conversation.thinking).toBe("");
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
