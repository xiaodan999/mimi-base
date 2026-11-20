import { describe, expect, test } from "bun:test";

import type { PostData } from "@/lib/pb-types";

import { applyCommentRealtime, applyLikeRealtime } from "./realtime-pure";

function post(overrides: Partial<PostData> = {}): PostData {
    return {
        id: "p1",
        text: "hello",
        author: { id: "viewer", user_name: "我", tou_xiang: "", circle: "" },
        createdAt: "2026-11-19T00:00:00.000Z",
        liked: false,
        layout: "twitter",
        collectionId: "posts",
        media: [],
        metrics: { likeCount: 2, replyCount: 1 },
        ...overrides,
    };
}

describe("applyLikeRealtime", () => {
    test("a partner's like increments the cached count", () => {
        const next = applyLikeRealtime(post(), "create", "partner", "viewer");
        expect(next.metrics.likeCount).toBe(3);
        expect(next.liked).toBe(false);
    });

    test("a partner's unlike decrements without going negative", () => {
        expect(
            applyLikeRealtime(post(), "delete", "partner", "viewer").metrics
                .likeCount,
        ).toBe(1);
        expect(
            applyLikeRealtime(
                post({ metrics: { likeCount: 0, replyCount: 0 } }),
                "delete",
                "partner",
                "viewer",
            ).metrics.likeCount,
        ).toBe(0);
    });

    test("our own like is a no-op when the optimistic cache already has it", () => {
        const liked = post({
            liked: true,
            metrics: { likeCount: 3, replyCount: 1 },
        });
        expect(applyLikeRealtime(liked, "create", "viewer", "viewer")).toBe(
            liked,
        );
        expect(
            applyLikeRealtime(post(), "create", "viewer", "viewer").liked,
        ).toBe(true);
    });

    test("ignores updates", () => {
        const value = post();
        expect(applyLikeRealtime(value, "update", "partner", "viewer")).toBe(
            value,
        );
    });
});

describe("applyCommentRealtime", () => {
    test("create/delete adjust the reply count", () => {
        expect(applyCommentRealtime(post(), "create").metrics.replyCount).toBe(
            2,
        );
        expect(applyCommentRealtime(post(), "delete").metrics.replyCount).toBe(
            0,
        );
    });

    test("never goes negative and ignores updates", () => {
        const zero = post({ metrics: { likeCount: 0, replyCount: 0 } });
        expect(applyCommentRealtime(zero, "delete")).toBe(zero);
        expect(applyCommentRealtime(zero, "update")).toBe(zero);
    });
});
