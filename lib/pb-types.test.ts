import { describe, expect, test } from "bun:test";

import { type PostRecord, toPostData } from "./pb-types";

function record(
    layout?: string,
    media: Pick<
        PostRecord,
        "images" | "videos" | "thumbs" | "media_meta" | "media_order"
    > = {},
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

describe("toPostData media", () => {
    test("walks media_order across photos and videos", () => {
        const data = toPostData(
            record("twitter", {
                images: ["a.webp", "b.webp"],
                videos: ["one.mp4", "two.mp4"],
                media_order: [
                    { type: "image", index: 0 },
                    { type: "video", index: 1 },
                    { type: "image", index: 1 },
                    { type: "video", index: 0 },
                ],
            }),
            new Set(),
        );

        expect(data.media.map((item) => item.name)).toEqual([
            "a.webp",
            "two.mp4",
            "b.webp",
            "one.mp4",
        ]);
    });

    test("old rows keep the clip first and photos after it", () => {
        const data = toPostData(
            record("twitter", {
                // A single-file field comes back as a plain string.
                videos: "clip.mp4",
                images: ["a.webp", "b.webp"],
            }),
            new Set(),
        );

        expect(data.media.map((item) => item.name)).toEqual([
            "clip.mp4",
            "a.webp",
            "b.webp",
        ]);
        expect(data.media[0]).toEqual({
            kind: "video",
            name: "clip.mp4",
        });
    });

    test("a malformed order never hides media", () => {
        const data = toPostData(
            record("twitter", {
                images: ["a.webp"],
                videos: ["one.mp4"],
                // Points past the stored arrays; both files must still show.
                media_order: [{ type: "image", index: 7 }],
            }),
            new Set(),
        );

        expect(data.media.map((item) => item.name)).toEqual([
            "one.mp4",
            "a.webp",
        ]);
    });

    test("carries positional sizes for photos and every video", () => {
        const data = toPostData(
            record("instagram", {
                images: ["a.webp"],
                videos: ["one.mp4", "two.mp4"],
                media_meta: {
                    images: [{ width: 800, height: 600 }],
                    videos: [{ width: 640, height: 360 }, null],
                },
                media_order: [
                    { type: "video", index: 0 },
                    { type: "image", index: 0 },
                    { type: "video", index: 1 },
                ],
            }),
            new Set(),
        );

        expect(data.layout).toBe("instagram");
        expect(data.media).toEqual([
            { kind: "video", name: "one.mp4", width: 640, height: 360 },
            { kind: "image", name: "a.webp", width: 800, height: 600 },
            { kind: "video", name: "two.mp4" },
        ]);
    });

    test("reads the legacy single-video size for video 0", () => {
        const data = toPostData(
            record("twitter", {
                videos: "clip.mp4",
                media_meta: { images: [], video: { width: 1280, height: 720 } },
            }),
            new Set(),
        );

        expect(data.media).toEqual([
            { kind: "video", name: "clip.mp4", width: 1280, height: 720 },
        ]);
    });

    test("attaches thumbnails by filename token regardless of order", () => {
        const data = toPostData(
            record("twitter", {
                images: ["b2_main.webp", "a1_main.webp"],
                thumbs: ["a1_thumbnail.webp", "b2_thumbnail.webp"],
                media_order: [
                    { type: "image", index: 1 },
                    { type: "image", index: 0 },
                ],
            }),
            new Set(),
        );

        expect(
            data.media.map((item) =>
                item.kind === "image" ? item.thumb : null,
            ),
        ).toEqual(["a1_thumbnail.webp", "b2_thumbnail.webp"]);
    });
});
