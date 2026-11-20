import { describe, expect, test } from "bun:test";

// `executeChatTool` reaches lib/env.ts through the sandbox API client. Bun's
// test runner is not a browser and CI has no .env, so pin a concrete origin
// before the module graph loads; the module stays cached afterwards.
(import.meta.env as unknown as Record<string, string>).VITE_POCKETBASE_URL =
    "http://127.0.0.1:8090";
const { executeChatTool } = await import("./tools");

const ATTACHMENT_ID = "raklyrsyp7i26xp";

describe("read_attachment tool", () => {
    test("serves text from the persisted part", async () => {
        const calls: string[] = [];
        const outcome = await executeChatTool(
            "read_attachment",
            JSON.stringify({ attachmentId: ATTACHMENT_ID, mode: "text" }),
            {},
            {
                readAttachmentText: async (attachmentId) => {
                    calls.push(attachmentId);
                    return { name: "notes.md", kind: "text", text: "# 标题" };
                },
            },
        );
        expect(calls).toEqual([ATTACHMENT_ID]);
        expect(outcome.isError).toBe(false);
        expect(outcome.result).toEqual({
            ok: true,
            attachmentId: ATTACHMENT_ID,
            name: "notes.md",
            text: "# 标题",
        });
    });

    test("renders pages locally and keeps images out of the JSON result", async () => {
        const outcome = await executeChatTool(
            "read_attachment",
            JSON.stringify({
                attachmentId: ATTACHMENT_ID,
                mode: "pages",
                pages: "2-3",
            }),
            {},
            {
                visionEnabled: true,
                readAttachmentPages: async (attachmentId, pages) => {
                    expect(attachmentId).toBe(ATTACHMENT_ID);
                    expect(pages).toBe("2-3");
                    return {
                        name: "合同.pdf",
                        numPages: 12,
                        pages: [2, 3],
                        images: ["data:image/jpeg;base64,AA", "not-an-image"],
                    };
                },
            },
        );
        expect(outcome.isError).toBe(false);
        expect(outcome.result).toEqual({
            ok: true,
            attachmentId: ATTACHMENT_ID,
            name: "合同.pdf",
            pages: [2, 3],
            numPages: 12,
        });
        expect(outcome.resultImages).toEqual(["data:image/jpeg;base64,AA"]);
        expect(JSON.stringify(outcome.result)).not.toContain("data:image");
    });

    test("pages are rejected for a text-only model", async () => {
        const outcome = await executeChatTool(
            "read_attachment",
            JSON.stringify({
                attachmentId: ATTACHMENT_ID,
                mode: "pages",
                pages: "1",
            }),
            {},
            { visionEnabled: false },
        );
        expect(outcome.isError).toBe(true);
        expect((outcome.result as { error: string }).error).toContain(
            "不支持图片",
        );
    });

    test("text errors surface as tool errors", async () => {
        const outcome = await executeChatTool(
            "read_attachment",
            JSON.stringify({ attachmentId: ATTACHMENT_ID, mode: "text" }),
            {},
            {
                readAttachmentText: async () => {
                    throw new Error(
                        "PDF 没有文字原文，请用 mode=pages 查看页面",
                    );
                },
            },
        );
        expect(outcome.isError).toBe(true);
        expect((outcome.result as { error: string }).error).toContain(
            "mode=pages",
        );
    });
});
