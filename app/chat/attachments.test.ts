import { describe, expect, test } from "bun:test";

import { MAX_FILE_CHARS, MAX_PAGE_IMAGES } from "@/lib/chat-files";

import {
    attachmentPartFromRecord,
    type AttachmentRecord,
    findAttachmentPart,
    readAttachmentFile,
    withFileRead,
} from "./attachments";

describe("readAttachmentFile", () => {
    test("decodes a text file", async () => {
        const file = new File(["# 标题\n\n正文"], "notes.md");
        const read = await readAttachmentFile(file);
        expect(read).toEqual({
            text: "# 标题\n\n正文",
            truncated: false,
            pageImages: [],
        });
    });

    test("caps long text", async () => {
        const file = new File(["a".repeat(MAX_FILE_CHARS + 10)], "big.txt");
        const read = await readAttachmentFile(file);
        expect(read.text).toHaveLength(MAX_FILE_CHARS);
        expect(read.truncated).toBe(true);
    });

    test("rejects binary, empty and unsupported files", async () => {
        await expect(
            readAttachmentFile(
                new File([new Uint8Array([0x61, 0, 0x62])], "notes.txt"),
            ),
        ).rejects.toThrow("不是文本");
        await expect(
            readAttachmentFile(new File([], "empty.txt")),
        ).rejects.toThrow("文件是空的");
        await expect(
            readAttachmentFile(new File(["  \n\t "], "blank.txt")),
        ).rejects.toThrow("文件是空的");
        await expect(
            readAttachmentFile(new File(["x"], "photo.jpg")),
        ).rejects.toThrow("不支持这种文件类型");
    });

    test("renders PDF pages through the injected renderer", async () => {
        const calls: { limit: number; bytes: number }[] = [];
        const read = await readAttachmentFile(
            new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "合同.pdf"),
            {
                pageImageLimit: MAX_PAGE_IMAGES + 5,
                renderPdf: async (data, pageImageLimit) => {
                    calls.push({
                        limit: pageImageLimit,
                        bytes: data.byteLength,
                    });
                    return {
                        numPages: 12,
                        pageImages:
                            pageImageLimit > 0
                                ? ["data:image/jpeg;base64,AA"]
                                : [],
                    };
                },
            },
        );
        // The budget is clamped and the bytes reach the renderer unchanged.
        expect(calls).toEqual([{ limit: MAX_PAGE_IMAGES, bytes: 4 }]);
        expect(read).toEqual({
            text: "",
            truncated: false,
            pageCount: 12,
            pageImages: ["data:image/jpeg;base64,AA"],
        });
    });

    test("a zero page budget still reports the page count", async () => {
        const read = await readAttachmentFile(
            new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "合同.pdf"),
            {
                pageImageLimit: 0,
                renderPdf: async () => ({
                    numPages: 3,
                    pageImages: [],
                }),
            },
        );
        expect(read).toEqual({
            text: "",
            truncated: false,
            pageCount: 3,
            pageImages: [],
        });
    });

    test("propagates renderer errors", async () => {
        await expect(
            readAttachmentFile(
                new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "x.pdf"),
                {
                    pageImageLimit: 1,
                    renderPdf: async () => {
                        throw new Error("这个 PDF 有密码，先取消密码再试");
                    },
                },
            ),
        ).rejects.toThrow("有密码");
    });
});

describe("attachment parts", () => {
    const record: AttachmentRecord = {
        id: "att1",
        collectionId: "col1",
        file: "contract_abc123.pdf",
        name: "订货合同.pdf",
        mime: "application/pdf",
        size: 12345,
        kind: "pdf",
    };

    test("starts as an empty shell around the stored record", () => {
        expect(attachmentPartFromRecord(record)).toEqual({
            type: "attachment",
            attachmentId: "att1",
            collectionId: "col1",
            file: "contract_abc123.pdf",
            name: "订货合同.pdf",
            mime: "application/pdf",
            size: 12345,
            kind: "pdf",
            truncated: false,
            extracted: "",
            pageImages: [],
        });
    });

    test("withFileRead folds a local read in without losing the reference", () => {
        const part = withFileRead(attachmentPartFromRecord(record), {
            text: "第一条",
            truncated: true,
            pageCount: 8,
            pageImages: ["data:image/jpeg;base64,AA"],
        });
        expect(part.attachmentId).toBe("att1");
        expect(part.file).toBe("contract_abc123.pdf");
        expect(part.pageCount).toBe(8);
        expect(part.truncated).toBe(true);
        expect(part.extracted).toBe("第一条");
        expect(part.pageImages).toHaveLength(1);
    });

    test("findAttachmentPart scans every message", () => {
        const first = attachmentPartFromRecord(record);
        const second = attachmentPartFromRecord({
            ...record,
            id: "att2",
            name: "notes.md",
            kind: "text",
        });
        const messages = [{ parts: [first] }, { parts: [second] }];
        expect(findAttachmentPart(messages, "att2")).toBe(second);
        expect(findAttachmentPart(messages, "missing")).toBeNull();
    });
});
