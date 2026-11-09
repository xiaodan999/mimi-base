import { describe, expect, test } from "bun:test";

import {
    attachmentSizeLabel,
    isImageAttachment,
    parseAttachmentList,
} from "./attachments";
import { MAX_FEEDBACK_ATTACHMENTS } from "./validation";

const URL_ONE = "https://github.com/o/r/releases/download/t/a.png";

describe("parseAttachmentList", () => {
    test("parses an array and a JSON string", () => {
        const value = [
            { name: "a.png", url: URL_ONE, size: 10, type: "image/png" },
        ];
        expect(parseAttachmentList(value)).toEqual(value);
        expect(parseAttachmentList(JSON.stringify(value))).toEqual(value);
    });

    test("drops malformed entries and non-https URLs", () => {
        expect(
            parseAttachmentList([
                null,
                "x",
                { name: "js", url: "javascript:alert(1)" },
                { name: "http", url: "http://example.com/a.png" },
                { name: "", url: URL_ONE },
            ]),
        ).toEqual([{ name: "附件", url: URL_ONE }]);
    });

    test("caps the list and ignores a non-array", () => {
        const many = Array.from(
            { length: MAX_FEEDBACK_ATTACHMENTS + 2 },
            (_, index) => ({
                name: `f-${index}.txt`,
                url: `${URL_ONE}?n=${index}`,
            }),
        );
        expect(parseAttachmentList(many)).toHaveLength(
            MAX_FEEDBACK_ATTACHMENTS,
        );
        expect(parseAttachmentList({})).toEqual([]);
        expect(parseAttachmentList("{")).toEqual([]);
    });
});

describe("isImageAttachment", () => {
    test("uses the MIME type, then the extension", () => {
        expect(isImageAttachment({ name: "a.bin", type: "image/png" })).toBe(
            true,
        );
        expect(isImageAttachment({ name: "a.JPG" })).toBe(true);
        expect(isImageAttachment({ name: "a.txt", type: "text/plain" })).toBe(
            false,
        );
    });
});

describe("attachmentSizeLabel", () => {
    test("formats bytes, KB and MB", () => {
        expect(attachmentSizeLabel(512)).toBe("512 B");
        expect(attachmentSizeLabel(1536)).toBe("1.5 KB");
        expect(attachmentSizeLabel(12 * 1024)).toBe("12 KB");
        expect(attachmentSizeLabel(10 * 1024 * 1024)).toBe("10 MB");
        expect(attachmentSizeLabel(0)).toBe("");
    });
});
