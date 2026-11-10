import { describe, expect, test } from "bun:test";

import { type PostRecord, toPostData } from "./pb-types";

function record(layout?: string): PostRecord {
    return {
        id: "post1234567890",
        collectionId: "posts123456789",
        collectionName: "posts",
        created: "2026-11-09T12:00:00.000Z",
        text: "hello",
        like_count: 0,
        comment_count: 0,
        layout,
    };
}

describe("toPostData layout", () => {
    test("keeps the three known layouts", () => {
        expect(toPostData(record("moments"), new Set()).layout).toBe("moments");
        expect(toPostData(record("instagram"), new Set()).layout).toBe(
            "instagram",
        );
        expect(toPostData(record("twitter"), new Set()).layout).toBe("twitter");
    });

    test("falls back to moments for old or empty values", () => {
        expect(toPostData(record(""), new Set()).layout).toBe("moments");
        expect(toPostData(record("something"), new Set()).layout).toBe(
            "moments",
        );
        expect(toPostData(record(), new Set()).layout).toBe("moments");
    });
});
