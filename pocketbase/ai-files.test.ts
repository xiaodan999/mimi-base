import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { MAX_FILE_CHARS } from "../lib/chat-files";
import { FileReadError, extractUploadedFile } from "./ai-files";

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

    test("refuses a scanned PDF when images are not allowed", async () => {
        await expect(
            extractUploadedFile("scan.pdf", pdf("scan.pdf")),
        ).rejects.toThrow("没有文字层");
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
