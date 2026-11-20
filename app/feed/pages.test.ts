import { describe, expect, test } from "bun:test";

import type { PostData } from "@/lib/pb-types";

import { patchPostInPages, type PostsData } from "./pages";

function post(id: string, likeCount = 0): PostData {
    return {
        id,
        text: id,
        author: { id: "u1", user_name: "测试", tou_xiang: "", circle: "" },
        createdAt: "2026-11-19T00:00:00.000Z",
        liked: false,
        layout: "twitter",
        collectionId: "posts",
        media: [],
        metrics: { likeCount, replyCount: 0 },
    };
}

function data(): PostsData {
    return {
        pages: [
            { posts: [post("a"), post("b")], nextPage: 2, total: 3 },
            { posts: [post("c")], nextPage: null, total: 3 },
        ],
        pageParams: [1, 2],
    };
}

describe("patchPostInPages", () => {
    test("patches only the matching post and page", () => {
        const before = data();
        const after = patchPostInPages(before, "b", (item) => ({
            ...item,
            metrics: { ...item.metrics, likeCount: 1 },
        }));
        expect(after).not.toBe(before);
        expect(after!.pages[0]).not.toBe(before.pages[0]);
        expect(after!.pages[0]!.posts[0]).toBe(before.pages[0]!.posts[0]);
        expect(after!.pages[0]!.posts[1]!.metrics.likeCount).toBe(1);
        // The untouched page keeps its identity.
        expect(after!.pages[1]).toBe(before.pages[1]);
    });

    test("returns the same data when nothing matches or changes", () => {
        const before = data();
        expect(patchPostInPages(before, "missing", (item) => item)).toBe(
            before,
        );
        expect(patchPostInPages(before, "a", (item) => ({ ...item }))).not.toBe(
            before,
        );
        const same = patchPostInPages(before, "a", (item) => item);
        expect(same).toBe(before);
    });

    test("handles a missing cache", () => {
        expect(
            patchPostInPages(undefined, "a", (item) => item),
        ).toBeUndefined();
    });
});
