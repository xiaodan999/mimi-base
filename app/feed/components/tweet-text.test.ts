import { describe, expect, test } from "bun:test";

import {
    TWEET_TEXT_LIMIT,
    tweetPreview,
    tweetWeightedLength,
} from "./tweet-text";

describe("tweetWeightedLength", () => {
    test("counts ordinary latin text one per character", () => {
        expect(tweetWeightedLength("hello world")).toBe(11);
        expect(tweetWeightedLength("line\nbreak")).toBe(10);
    });

    test("counts CJK and emoji as two", () => {
        expect(tweetWeightedLength("你好")).toBe(4);
        expect(tweetWeightedLength("ok 你好")).toBe(7);
        expect(tweetWeightedLength("🚀")).toBe(2);
        expect(tweetWeightedLength("hi 🚀")).toBe(5);
    });

    test("counts a whole link as t.co's 23", () => {
        expect(tweetWeightedLength("https://example.com/a/b/c")).toBe(23);
        expect(tweetWeightedLength("see https://example.com")).toBe(27);
    });
});

describe("tweetPreview", () => {
    test("keeps posts at or under the limit whole", () => {
        expect(tweetPreview("a".repeat(TWEET_TEXT_LIMIT))).toBeNull();
        // 139 emoji (278) plus "ab" is exactly 280 weighted.
        expect(tweetPreview(`${"😀".repeat(139)}ab`)).toBeNull();
    });

    test("cuts a long latin post at a word boundary", () => {
        const text = "word ".repeat(100).trim();
        const preview = tweetPreview(text);
        expect(preview).not.toBeNull();
        expect(preview?.length).toBeLessThanOrEqual(TWEET_TEXT_LIMIT);
        expect(preview?.endsWith("word")).toBe(true);
        expect(preview?.endsWith(" ")).toBe(false);
    });

    test("cuts a long unbroken run at the weighted limit", () => {
        const preview = tweetPreview("a".repeat(400));
        expect(preview).toBe("a".repeat(TWEET_TEXT_LIMIT));
    });

    test("cuts Chinese by weighted length without dropping half a pair", () => {
        const text = "你".repeat(141);
        const preview = tweetPreview(text);
        expect(preview).toBe("你".repeat(140));
    });

    test("strips a trailing space left by the word boundary", () => {
        const preview = tweetPreview(`${"a".repeat(279)} b`);
        expect(preview).toBe("a".repeat(279));
    });

    test("returns null for short CJK and for empty text", () => {
        expect(tweetPreview("你好世界")).toBeNull();
        expect(tweetPreview("")).toBeNull();
    });
});
