import { describe, expect, test } from "bun:test";

import { protectedFileKey, withFileToken } from "./protected-image-url";

describe("withFileToken", () => {
    test("replaces an expired token", () => {
        const url =
            "http://mimi.local/db/api/files/posts/p1/a.jpg?thumb=400x400&token=old";
        expect(withFileToken(url, "new")).toBe(
            "http://mimi.local/db/api/files/posts/p1/a.jpg?thumb=400x400&token=new",
        );
    });

    test("adds a token to a tokenless file URL", () => {
        expect(withFileToken("/db/api/files/posts/p1/a.jpg", "new")).toBe(
            "http://mimi.local/db/api/files/posts/p1/a.jpg?token=new",
        );
    });

    test("ignores non-file URLs and empty tokens", () => {
        expect(withFileToken("https://example.com/a.jpg", "new")).toBeNull();
        expect(withFileToken("/db/api/files/posts/p1/a.jpg", "")).toBeNull();
    });
});

describe("protectedFileKey", () => {
    test("drops the expiring token but keeps the file identity", () => {
        const a = protectedFileKey(
            "/db/api/files/posts/p1/a.jpg?thumb=400x400&token=one",
        );
        const b = protectedFileKey(
            "/db/api/files/posts/p1/a.jpg?thumb=400x400&token=two",
        );
        expect(a).toBe(b);
        expect(a).toContain("thumb=400x400");
        expect(a).not.toContain("token=");
    });

    test("ignores unrelated URLs", () => {
        expect(protectedFileKey("/images/logo.png")).toBeNull();
    });
});
