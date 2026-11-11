import { describe, expect, test } from "bun:test";

import { type PostRecord, toPostData } from "./pb-types";

function record(
    layout?: string,
    media: Pick<PostRecord, "images" | "videos"> = {},
): PostRecord {
    return {
        id: "post1234567890",
        collectionId: "posts123456789",
        collectionName: "posts",
        created: "2026-11-09T12:00:00.000Z",
        text: "hello",
        like_count: 0,
        comment_count: 0,
        layout,
        ...media,
    };
}

describe("toPostData layout", () => {
    test("keeps the two supported layouts when the post has media", () => {
        expect(
            toPostData(record("instagram", { images: ["a.webp"] }), new Set())
                .layout,
        ).toBe("instagram");
        expect(
            toPostData(record("instagram", { videos: "clip.mp4" }), new Set())
                .layout,
        ).toBe("instagram");
        expect(
            toPostData(record("twitter", { images: ["a.webp"] }), new Set())
                .layout,
        ).toBe("twitter");
    });

    test("renders retired moments rows and empty values as twitter", () => {
        expect(toPostData(record("moments"), new Set()).layout).toBe("twitter");
        expect(toPostData(record(""), new Set()).layout).toBe("twitter");
        expect(toPostData(record("something"), new Set()).layout).toBe(
            "twitter",
        );
        expect(toPostData(record(), new Set()).layout).toBe("twitter");
    });

    test("renders a text-only row as twitter even when saved as instagram", () => {
        // Removing the last photo from a 大图 post saves the old layout value
        // because the composer hides the picker; the row must not keep the
        // full-bleed card.
        expect(toPostData(record("instagram"), new Set()).layout).toBe(
            "twitter",
        );
        expect(
            toPostData(
                record("instagram", { images: [], videos: "" }),
                new Set(),
            ).layout,
        ).toBe("twitter");
    });
});
