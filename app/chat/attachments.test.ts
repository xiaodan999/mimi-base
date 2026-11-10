import { describe, expect, test } from "bun:test";

import { PDF_NO_TEXT_LAYER_CODE } from "@/lib/chat-files";

import {
    attachmentPartFromRecord,
    type AttachmentReadPost,
    parseUploadedFileResponse,
    readAttachmentText,
    withExtracted,
} from "./attachments";

describe("parseUploadedFileResponse", () => {
    test("keeps the server result and image data URLs", () => {
        const file = parseUploadedFileResponse(
            {
                name: "scan.pdf",
                kind: "pdf",
                content: "",
                truncated: true,
                numPages: 12,
                images: ["data:image/jpeg;base64,AA", "not-an-image"],
            },
            "fallback.pdf",
        );
        expect(file).toEqual({
            name: "scan.pdf",
            kind: "pdf",
            content: "",
            truncated: true,
            numPages: 12,
            pageImages: ["data:image/jpeg;base64,AA"],
        });
    });

    test("keeps rendered page numbers for a pages-mode read", () => {
        const file = parseUploadedFileResponse(
            {
                name: "合同.pdf",
                kind: "pdf",
                content: "",
                truncated: false,
                numPages: 30,
                pages: [5, 6, "bad", 7],
                images: [
                    "data:image/jpeg;base64,AA",
                    "data:image/jpeg;base64,BB",
                ],
            },
            "",
        );
        // Pages pair with the images; extras and junk are dropped.
        expect(file.pages).toEqual([5, 6]);
        expect(file.pageImages).toHaveLength(2);
        expect(file.numPages).toBe(30);
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

describe("attachment parts", () => {
    const record = {
        id: "att1",
        collectionId: "col1",
        file: "contract_abc123.pdf",
        name: "订货合同.pdf",
        mime: "application/pdf",
        size: 12345,
        kind: "pdf" as const,
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

    test("withExtracted folds the extraction in without losing the reference", () => {
        const part = withExtracted(attachmentPartFromRecord(record), {
            name: "订货合同.pdf",
            kind: "pdf",
            content: "第一条",
            truncated: true,
            numPages: 8,
            pageImages: ["data:image/jpeg;base64,AA"],
        });
        expect(part.attachmentId).toBe("att1");
        expect(part.file).toBe("contract_abc123.pdf");
        expect(part.pageCount).toBe(8);
        expect(part.truncated).toBe(true);
        expect(part.extracted).toBe("第一条");
        expect(part.pageImages).toHaveLength(1);
    });
});

describe("readAttachmentText", () => {
    const ATTACHMENT_ID = "raklyrsyp7i26xp";

    /** An Error duck-typing ChatApiError with the relay's scan code. */
    const scanError = () =>
        Object.assign(
            new Error(
                "这个 PDF 没有文字层（可能是扫描件），读不出文字；换一个支持视觉的模型再试",
            ),
            { code: PDF_NO_TEXT_LAYER_CODE, status: 400 },
        );

    test("passes a plain text read straight through", async () => {
        const bodies: Record<string, unknown>[] = [];
        const post: AttachmentReadPost = async (_path, body) => {
            bodies.push(body);
            return {
                ok: true,
                name: "notes.pdf",
                kind: "pdf",
                content: "第一条",
                truncated: false,
                numPages: 5,
            };
        };
        const outcome = await readAttachmentText(post, ATTACHMENT_ID, true);
        expect(bodies).toEqual([{ attachmentId: ATTACHMENT_ID }]);
        expect(outcome.result).toEqual({
            ok: true,
            name: "notes.pdf",
            kind: "pdf",
            content: "第一条",
            truncated: false,
            numPages: 5,
        });
        expect(outcome.resultImages).toBeUndefined();
    });

    test("a scan error on a text-only model fails with the relay's message", async () => {
        const bodies: Record<string, unknown>[] = [];
        const post: AttachmentReadPost = async (_path, body) => {
            bodies.push(body);
            throw scanError();
        };
        const outcome = await readAttachmentText(post, ATTACHMENT_ID, false);
        expect(bodies).toEqual([{ attachmentId: ATTACHMENT_ID }]);
        expect(outcome.result).toEqual({
            ok: false,
            attachmentId: ATTACHMENT_ID,
            error: expect.stringContaining("没有文字层"),
        });
        expect(outcome.resultImages).toBeUndefined();
    });

    test("a vision model retries the scan with page images", async () => {
        const bodies: Record<string, unknown>[] = [];
        const post: AttachmentReadPost = async (_path, body) => {
            bodies.push(body);
            if (bodies.length === 1) throw scanError();
            return {
                ok: true,
                name: "scan.pdf",
                kind: "pdf",
                content: "",
                truncated: false,
                numPages: 3,
                images: [
                    "data:image/jpeg;base64,AA",
                    "data:image/jpeg;base64,BB",
                    "not-an-image",
                ],
            };
        };
        const outcome = await readAttachmentText(post, ATTACHMENT_ID, true);
        expect(bodies).toEqual([
            { attachmentId: ATTACHMENT_ID },
            { attachmentId: ATTACHMENT_ID, pageImageLimit: 10 },
        ]);
        expect(outcome.result).toEqual({
            ok: true,
            attachmentId: ATTACHMENT_ID,
            name: "scan.pdf",
            numPages: 3,
            noTextLayer: true,
            pagesRendered: 2,
        });
        expect(outcome.resultImages).toEqual([
            "data:image/jpeg;base64,AA",
            "data:image/jpeg;base64,BB",
        ]);
    });

    test("a failing retry reports the retry's error", async () => {
        const bodies: Record<string, unknown>[] = [];
        const post: AttachmentReadPost = async (_path, body) => {
            bodies.push(body);
            if (bodies.length === 1) throw scanError();
            throw new Error("扫描件暂时读不了，先把 PDF 转成文字或图片再发");
        };
        const outcome = await readAttachmentText(post, ATTACHMENT_ID, true);
        expect(bodies).toHaveLength(2);
        expect(outcome.result).toEqual({
            ok: false,
            attachmentId: ATTACHMENT_ID,
            error: "扫描件暂时读不了，先把 PDF 转成文字或图片再发",
        });
        expect(outcome.resultImages).toBeUndefined();
    });

    test("other errors never trigger the retry", async () => {
        let calls = 0;
        const post: AttachmentReadPost = async () => {
            calls += 1;
            throw new Error("找不到这个附件，可能已经被删了");
        };
        const outcome = await readAttachmentText(post, ATTACHMENT_ID, true);
        expect(calls).toBe(1);
        expect(outcome.result).toEqual({
            ok: false,
            attachmentId: ATTACHMENT_ID,
            error: "找不到这个附件，可能已经被删了",
        });
    });
});
