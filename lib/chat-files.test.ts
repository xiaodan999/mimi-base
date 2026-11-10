import { describe, expect, test } from "bun:test";

import {
    FILE_ACCEPT,
    isAllowedFileSize,
    isPdfFileName,
    isRecordId,
    isSupportedFileName,
    MAX_FILE_BYTES,
    parsePageSpec,
    sanitizeFileName,
} from "./chat-files";

describe("chat file allowlist", () => {
    test("accepts the picker extensions case-insensitively", () => {
        expect(isSupportedFileName("notes.MD")).toBe(true);
        expect(isSupportedFileName("scan.PDF")).toBe(true);
        expect(FILE_ACCEPT).toContain(".pdf");
    });

    test("rejects binaries and extensionless names", () => {
        expect(isSupportedFileName("photo.jpg")).toBe(false);
        expect(isSupportedFileName("README")).toBe(false);
        expect(isSupportedFileName("archive.zip")).toBe(false);
    });

    test("detects PDFs only by the final extension", () => {
        expect(isPdfFileName("a.b.pdf")).toBe(true);
        expect(isPdfFileName("pdf.txt")).toBe(false);
    });
});

describe("sanitizeFileName", () => {
    test("keeps the basename and Chinese characters", () => {
        expect(sanitizeFileName("/tmp/合同 2026.pdf")).toBe("合同 2026.pdf");
        expect(sanitizeFileName("..\\扫描件.pdf")).toBe("扫描件.pdf");
    });

    test("strips control characters and falls back", () => {
        expect(sanitizeFileName("a\u0000b\n.pdf")).toBe("ab.pdf");
        expect(sanitizeFileName("")).toBe("附件");
    });
});

describe("isAllowedFileSize", () => {
    test("rejects empty, oversized and non-finite sizes", () => {
        expect(isAllowedFileSize(0)).toBe(false);
        expect(isAllowedFileSize(MAX_FILE_BYTES + 1)).toBe(false);
        expect(isAllowedFileSize(Number.NaN)).toBe(false);
        expect(isAllowedFileSize(MAX_FILE_BYTES)).toBe(true);
    });
});

describe("parsePageSpec", () => {
    test("parses single pages and ranges in any order", () => {
        expect(parsePageSpec("3", 20)).toEqual([3]);
        expect(parsePageSpec("2-5", 20)).toEqual([2, 3, 4, 5]);
        expect(parsePageSpec("5-2", 20)).toEqual([2, 3, 4, 5]);
        expect(parsePageSpec("1, 3，7", 20)).toEqual([1, 3, 7]);
    });

    test("clamps to the document and drops junk", () => {
        expect(parsePageSpec("0, 8, 21", 20)).toEqual([8]);
        expect(parsePageSpec("abc", 20)).toEqual([]);
        expect(parsePageSpec("", 20)).toEqual([]);
    });

    test("caps the number of pages per request", () => {
        expect(parsePageSpec("1-30", 200)).toHaveLength(10);
        expect(parsePageSpec("1-30", 3)).toEqual([1, 2, 3]);
    });
});

describe("isRecordId", () => {
    test("accepts PocketBase record ids", () => {
        expect(isRecordId("x7k2m9q4p1n8r3s")).toBe(true);
        expect(isRecordId("att1")).toBe(true);
    });

    test("rejects file names and paths — the read_attachment guess trap", () => {
        expect(isRecordId("索尼耳机WH-1000XM5.pdf")).toBe(false);
        expect(isRecordId("contract.pdf")).toBe(false);
        expect(isRecordId("../etc/passwd")).toBe(false);
        expect(isRecordId("")).toBe(false);
    });
});
