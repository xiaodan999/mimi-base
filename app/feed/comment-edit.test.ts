import { describe, expect, test } from "bun:test";

import {
    commentTextError,
    isCommentEdited,
    MAX_COMMENT_LENGTH,
} from "./comment-edit";

describe("isCommentEdited", () => {
    test("is false when PocketBase never bumped updated", () => {
        const at = "2026-11-09 10:22:04.123Z";
        expect(isCommentEdited({ createdAt: at, updatedAt: at })).toBe(false);
    });

    test("is false when updatedAt is missing", () => {
        expect(
            isCommentEdited({
                createdAt: "2026-11-09 10:22:04.123Z",
                updatedAt: "",
            }),
        ).toBe(false);
    });

    test("is true when updated moved past created", () => {
        expect(
            isCommentEdited({
                createdAt: "2026-11-09 10:22:04.123Z",
                updatedAt: "2026-11-09 10:25:04.123Z",
            }),
        ).toBe(true);
    });

    test("accepts ISO timestamps with a T separator", () => {
        expect(
            isCommentEdited({
                createdAt: "2026-11-09T10:22:04.123Z",
                updatedAt: "2026-11-09T10:23:04.123Z",
            }),
        ).toBe(true);
    });

    test("falls back to inequality when a timestamp is malformed", () => {
        expect(
            isCommentEdited({
                createdAt: "not-a-date",
                updatedAt: "also-not-a-date",
            }),
        ).toBe(true);
    });
});

describe("commentTextError", () => {
    test("rejects an empty text-only comment", () => {
        expect(commentTextError("   ", 0)).toBe("评论内容不能为空");
    });

    test("allows an empty text when images are present", () => {
        expect(commentTextError("", 2)).toBeNull();
    });

    test("accepts normal text", () => {
        expect(commentTextError("  好的  ", 0)).toBeNull();
    });

    test("flags text past the shared cap", () => {
        expect(commentTextError("a".repeat(MAX_COMMENT_LENGTH + 1), 0)).toBe(
            `评论最多 ${MAX_COMMENT_LENGTH} 字`,
        );
        expect(commentTextError("a".repeat(MAX_COMMENT_LENGTH), 0)).toBeNull();
    });
});
