import { describe, expect, test } from "bun:test";

import {
    attachmentToMessageText,
    parseUploadedFileResponse,
} from "./attachments";

describe("attachmentToMessageText", () => {
    test("fences extracted text under a header", () => {
        expect(
            attachmentToMessageText({
                name: "笔记.md",
                kind: "text",
                content: "# 你好",
                truncated: false,
            }),
        ).toBe("[附件 笔记.md]\n```\n# 你好\n```");
    });

    test("mentions truncation", () => {
        expect(
            attachmentToMessageText({
                name: "big.txt",
                kind: "text",
                content: "x",
                truncated: true,
            }),
        ).toContain("内容过长，已截断");
    });

    test("labels a scanned PDF as page images", () => {
        expect(
            attachmentToMessageText({
                name: "scan.pdf",
                kind: "pdf",
                content: "",
                truncated: true,
                pageImages: ["data:image/jpeg;base64,AA"],
            }),
        ).toBe("[附件 scan.pdf（扫描件，已转成 1 页图片发送）]");
    });
});

describe("parseUploadedFileResponse", () => {
    test("keeps the server result and image data URLs", () => {
        const file = parseUploadedFileResponse(
            {
                name: "scan.pdf",
                kind: "pdf",
                content: "",
                truncated: true,
                images: ["data:image/jpeg;base64,AA", "not-an-image"],
            },
            "fallback.pdf",
        );
        expect(file).toEqual({
            name: "scan.pdf",
            kind: "pdf",
            content: "",
            truncated: true,
            pageImages: ["data:image/jpeg;base64,AA"],
        });
    });

    test("falls back to the picked name", () => {
        const file = parseUploadedFileResponse(
            { kind: "text", content: "hi", truncated: false },
            "picked.md",
        );
        expect(file.name).toBe("picked.md");
    });

    test("rejects malformed payloads", () => {
        expect(() => parseUploadedFileResponse(null, "x.md")).toThrow(
            "文件读取失败",
        );
        expect(() =>
            parseUploadedFileResponse({ kind: "zip" }, "x.md"),
        ).toThrow("文件读取失败");
    });
});
