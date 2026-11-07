import { describe, expect, test } from "bun:test";

import {
    attachmentPartFromRecord,
    parseUploadedFileResponse,
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
