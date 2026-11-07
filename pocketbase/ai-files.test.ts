import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { MAX_FILE_CHARS, PDF_NO_TEXT_LAYER_CODE } from "../lib/chat-files";
import {
    FileReadError,
    extractPdfPageImages,
    extractUploadedFile,
} from "./ai-files";

const fixtures = path.join(import.meta.dir, "__fixtures__/chat-files");
const pdf = (name: string) =>
    new Uint8Array(readFileSync(path.join(fixtures, name)));
const text = (value: string) => new TextEncoder().encode(value);

describe("extractUploadedFile", () => {
    test("reads a text file", async () => {
        const file = await extractUploadedFile(
            "notes.md",
            text("# 标题\n\n正文"),
        );
        expect(file).toMatchObject({
            name: "notes.md",
            kind: "text",
            content: "# 标题\n\n正文",
            truncated: false,
        });
    });

    test("caps long text", async () => {
        const file = await extractUploadedFile(
            "big.txt",
            text("a".repeat(MAX_FILE_CHARS + 10)),
        );
        expect(file.content).toHaveLength(MAX_FILE_CHARS);
        expect(file.truncated).toBe(true);
    });

    test("keeps only the basename", async () => {
        const file = await extractUploadedFile("/tmp/合同 2026.md", text("ok"));
        expect(file.name).toBe("合同 2026.md");
    });

    test("rejects unsupported and binary text files", async () => {
        await expect(
            extractUploadedFile("photo.jpg", text("x")),
        ).rejects.toThrow("不支持这种文件类型");
        await expect(
            extractUploadedFile("notes.txt", new Uint8Array([0x61, 0, 0x62])),
        ).rejects.toThrow("不是文本");
        await expect(
            extractUploadedFile("empty.txt", new Uint8Array()),
        ).rejects.toThrow("文件是空的");
        await expect(
            extractUploadedFile("blank.txt", text("  \n\t ")),
        ).rejects.toThrow("文件是空的");
    });

    test("extracts Chinese text with pdf.js CMaps", async () => {
        const file = await extractUploadedFile(
            "cjk-text.pdf",
            pdf("cjk-text.pdf"),
        );
        expect(file.kind).toBe("pdf");
        expect(file.content).toContain("你好");
        expect(file.content).toContain("附件读取测试");
        expect(file.images).toBeUndefined();
    });

    test("a vision caller gets text AND page images from a text PDF", async () => {
        const file = await extractUploadedFile(
            "cjk-text.pdf",
            pdf("cjk-text.pdf"),
            { pageImageLimit: 3 },
        );
        expect(file.content).toContain("你好");
        expect(file.numPages).toBeGreaterThanOrEqual(1);
        expect(file.images?.length).toBeGreaterThanOrEqual(1);
        expect(file.images?.[0]).toStartWith("data:image/jpeg;base64,");
        // Only the first `limit` pages render inline.
        expect(file.images!.length).toBeLessThanOrEqual(3);
    });

    test("refuses a scanned PDF when images are not allowed", async () => {
        try {
            await extractUploadedFile("scan.pdf", pdf("scan.pdf"));
            throw new Error("expected a rejection");
        } catch (error) {
            expect(error).toBeInstanceOf(FileReadError);
            const fileError = error as FileReadError;
            expect(fileError.message).toContain("没有文字层");
            // The client retries this one with page images when the model
            // takes images, so it must be recognizable as this exact case.
            expect(fileError.code).toBe(PDF_NO_TEXT_LAYER_CODE);
            expect(fileError.status).toBe(400);
        }
    });

    test("renders a scanned PDF to JPEG pages", async () => {
        const file = await extractUploadedFile("scan.pdf", pdf("scan.pdf"), {
            pageImageLimit: 2,
        });
        expect(file.kind).toBe("pdf");
        expect(file.content).toBe("");
        expect(file.images).toHaveLength(1);
        expect(file.images?.[0]).toStartWith("data:image/jpeg;base64,");
    });

    test("rejects bytes that are not a PDF", async () => {
        await expect(
            extractUploadedFile("fake.pdf", text("hello")),
        ).rejects.toThrow("不是有效的 PDF");
    });

    test("FileReadError carries an HTTP status", async () => {
        try {
            await extractUploadedFile("empty.txt", new Uint8Array());
        } catch (error) {
            expect(error).toBeInstanceOf(FileReadError);
            expect((error as FileReadError).status).toBe(400);
        }
    });
});

describe("extractPdfPageImages", () => {
    test("renders the requested pages of a stored PDF", async () => {
        const file = await extractPdfPageImages(
            "cjk-text.pdf",
            pdf("cjk-text.pdf"),
            "1",
        );
        expect(file.kind).toBe("pdf");
        expect(file.pages).toEqual([1]);
        expect(file.images).toHaveLength(1);
        expect(file.numPages).toBeGreaterThanOrEqual(1);
    });

    test("rejects non-PDFs and impossible page specs", async () => {
        await expect(
            extractPdfPageImages("notes.md", text("hello"), "1"),
        ).rejects.toThrow("只有 PDF");
        await expect(
            extractPdfPageImages("cjk-text.pdf", pdf("cjk-text.pdf"), "999"),
        ).rejects.toThrow("页码不对");
        await expect(
            extractPdfPageImages("cjk-text.pdf", pdf("cjk-text.pdf"), "abc"),
        ).rejects.toThrow("页码不对");
    });
});
