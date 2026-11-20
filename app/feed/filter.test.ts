import { describe, expect, test } from "bun:test";

import { postFilterKey } from "./filter";

describe("postFilterKey", () => {
    test("keeps the unfiltered feed on one stable key", () => {
        expect(postFilterKey()).toBe("latest");
        expect(postFilterKey({})).toBe("latest");
        // Empty strings are not a filter (buildFilter skips them too).
        expect(postFilterKey({ month: "", q: "", post: "" })).toBe("latest");
    });

    test("encodes each dimension of the ANDed filter", () => {
        expect(postFilterKey({ month: "2026-11" })).toBe("month:2026-11");
        expect(postFilterKey({ q: "约会" })).toBe(
            `q:${encodeURIComponent("约会")}`,
        );
        expect(postFilterKey({ post: "abc123" })).toBe("post:abc123");
        expect(postFilterKey({ month: "2026-11", q: "x" })).toBe(
            "month:2026-11&q:x",
        );
        expect(
            postFilterKey({ post: "abc123", month: "2026-11", q: "x" }),
        ).toBe("post:abc123&month:2026-11&q:x");
    });

    test("a month + search cannot reuse the month-only cache entry", () => {
        expect(postFilterKey({ month: "2026-11", q: "x" })).not.toBe(
            postFilterKey({ month: "2026-11" }),
        );
        expect(postFilterKey({ month: "2026-11", q: "x" })).not.toBe(
            postFilterKey({ q: "x" }),
        );
        expect(postFilterKey({ post: "abc123", q: "x" })).not.toBe(
            postFilterKey({ post: "abc123" }),
        );
    });

    test("a search cannot spell another dimension", () => {
        expect(postFilterKey({ q: "a&month:2026-11" })).not.toBe(
            postFilterKey({ month: "2026-11", q: "a" }),
        );
    });
});
