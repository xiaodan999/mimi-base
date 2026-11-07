import { describe, expect, test } from "bun:test";

import {
    FILE_ACCEPT,
    MAX_FILE_BYTES,
    isAllowedFileSize,
    isPdfFileName,
    isSupportedFileName,
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
