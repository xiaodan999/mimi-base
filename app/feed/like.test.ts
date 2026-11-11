import { describe, expect, test } from "bun:test";

import type { PostData } from "@/lib/pb-types";

import { applyLikeToggle } from "./like";

function makePost(liked: boolean, likeCount: number): PostData {
    return {
        id: "post-1",
        text: "hello",
        author: { id: "user-1", user_name: "测试", tou_xiang: "", circle: "" },
        createdAt: "2026-11-11T00:00:00.000Z",
        liked,
        layout: "twitter",
        collectionId: "posts",
        images: [],
        videos: [],
        metrics: { likeCount, replyCount: 0 },
    };
}

describe("applyLikeToggle", () => {
    test("likes an unliked post", () => {
        const next = applyLikeToggle(makePost(false, 0), true);
        expect(next.liked).toBe(true);
        expect(next.metrics.likeCount).toBe(1);
    });

    test("unlikes a liked post", () => {
        const next = applyLikeToggle(makePost(true, 1), false);
        expect(next.liked).toBe(false);
        expect(next.metrics.likeCount).toBe(0);
    });

    test("does nothing when the cache already has the requested state", () => {
        const liked = makePost(true, 1);
        expect(applyLikeToggle(liked, true)).toBe(liked);

        const unliked = makePost(false, 0);
        expect(applyLikeToggle(unliked, false)).toBe(unliked);
    });

    test("a double-tapped unlike subtracts only once", () => {
        // #84: both clicks read the same rendered `liked`, so the second one
        // repeats `like: false`. The count must stay at 0, not become -1.
        const first = applyLikeToggle(makePost(true, 1), false);
        const second = applyLikeToggle(first, false);

        expect(first.metrics.likeCount).toBe(0);
        expect(second.metrics.likeCount).toBe(0);
        expect(second.liked).toBe(false);
    });

    test("clamps an inconsistent cache at zero", () => {
        const next = applyLikeToggle(makePost(true, 0), false);
        expect(next.liked).toBe(false);
        expect(next.metrics.likeCount).toBe(0);
    });

    test("does not mutate the cached post", () => {
        const post = makePost(false, 2);
        applyLikeToggle(post, true);
        expect(post.liked).toBe(false);
        expect(post.metrics.likeCount).toBe(2);
    });
});
