import { describe, expect, test } from "bun:test";

import {
    notificationAction,
    notificationExcerpt,
    notificationSearch,
    opensComments,
    parseNotificationType,
} from "./format";

describe("parseNotificationType", () => {
    test("accepts every stored type", () => {
        for (const type of [
            "post_like",
            "comment_like",
            "post_comment",
            "comment_reply",
        ] as const) {
            expect(parseNotificationType(type)).toBe(type);
        }
    });

    test("ignores unknown or empty values", () => {
        expect(parseNotificationType("mention")).toBeNull();
        expect(parseNotificationType("")).toBeNull();
    });
});

describe("notificationAction", () => {
    test("describes each interaction", () => {
        expect(notificationAction("post_like")).toBe("赞了你的动态");
        expect(notificationAction("comment_like")).toBe("赞了你的评论");
        expect(notificationAction("post_comment")).toBe("评论了你的动态");
        expect(notificationAction("comment_reply")).toBe("回复了你的评论");
    });
});

describe("notificationExcerpt", () => {
    test("uses the post for likes and the comment for replies/comments", () => {
        expect(
            notificationExcerpt("post_like", " 今天的晚饭 ", "ignored"),
        ).toBe("今天的晚饭");
        expect(
            notificationExcerpt("post_comment", "post", " 看起来不错 "),
        ).toBe("看起来不错");
        expect(notificationExcerpt("comment_reply", "post", " 同意 ")).toBe(
            "同意",
        );
    });

    test("falls back to a readable label for media-only interactions", () => {
        expect(notificationExcerpt("post_like", "", "")).toBe("查看详情");
        expect(notificationExcerpt("comment_like", "post", "")).toBe("post");
        expect(notificationExcerpt("comment_like", "", "")).toBe("查看详情");
    });
});

describe("notificationSearch", () => {
    test("opens comments for comment interactions", () => {
        expect(notificationSearch("post_like", "p1")).toEqual({ post: "p1" });
        expect(notificationSearch("comment_like", "p1")).toEqual({
            post: "p1",
            comments: "1",
        });
        expect(notificationSearch("post_comment", "p1")).toEqual({
            post: "p1",
            comments: "1",
        });
        expect(notificationSearch("comment_reply", "p1")).toEqual({
            post: "p1",
            comments: "1",
        });
    });

    test("only the post-like type stays in the feed", () => {
        expect(opensComments("post_like")).toBe(false);
        expect(opensComments("comment_like")).toBe(true);
        expect(opensComments("post_comment")).toBe(true);
        expect(opensComments("comment_reply")).toBe(true);
    });
});
