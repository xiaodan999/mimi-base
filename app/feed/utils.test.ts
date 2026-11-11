import { describe, expect, test } from "bun:test";

import {
    buildPostMediaFields,
    formatMonthLabel,
    groupPostMonths,
    indexMediaByKind,
    monthKeyOf,
    moveArrayItem,
    sortTargetAt,
} from "./utils";

/** Local-time timestamp so the test never depends on the runner's zone. */
function at(year: number, month: number, day = 15, hour = 12) {
    return new Date(year, month - 1, day, hour).toISOString();
}

describe("monthKeyOf", () => {
    test("uses the local calendar month", () => {
        expect(monthKeyOf(at(2024, 3))).toBe("2024-03");
        expect(monthKeyOf(at(2024, 11))).toBe("2024-11");
    });

    test("returns an empty key for invalid dates", () => {
        expect(monthKeyOf("not a date")).toBe("");
    });
});

describe("formatMonthLabel", () => {
    test("drops the zero padding", () => {
        expect(formatMonthLabel("2024-03")).toBe("2024年3月");
        expect(formatMonthLabel("2024-12")).toBe("2024年12月");
    });

    test("keeps malformed keys readable", () => {
        expect(formatMonthLabel("2024")).toBe("2024");
    });
});

describe("groupPostMonths", () => {
    test("counts posts per month, newest first", () => {
        const months = groupPostMonths([
            at(2024, 3),
            at(2024, 3, 1),
            at(2023, 12),
            at(2024, 3, 28),
            at(2025, 1),
        ]);

        expect(months).toEqual([
            { key: "2025-01", label: "2025年1月", count: 1 },
            { key: "2024-03", label: "2024年3月", count: 3 },
            { key: "2023-12", label: "2023年12月", count: 1 },
        ]);
    });

    test("skips invalid timestamps", () => {
        expect(groupPostMonths(["", "nope"])).toEqual([]);
    });
});

describe("buildPostMediaFields", () => {
    const newImage = new File(["new"], "a1_main.webp", { type: "image/webp" });
    const newThumb = new File(["thumb"], "a1_thumbnail.webp", {
        type: "image/webp",
    });
    const newVideo = new File(["clip"], "clip.mp4", { type: "video/mp4" });

    test("keeps the pick order for a create request", () => {
        expect(
            buildPostMediaFields([
                { type: "image", kind: "file", file: newImage },
                { type: "video", kind: "file", file: newVideo },
                { type: "image", kind: "file", file: newImage },
            ]),
        ).toEqual({
            keepImages: [],
            files: [newImage, newImage],
            keepThumbs: [],
            thumbs: [],
            keepVideos: [],
            videoFiles: [newVideo],
            mediaMeta: { images: [null, null], videos: [null] },
            order: [
                { type: "image", index: 0 },
                { type: "video", index: 0 },
                { type: "image", index: 1 },
            ],
        });
    });

    test("indexes kept files first, then uploads, in the mixed order", () => {
        // Composer: kept photo, new photo, kept clip, new clip.
        expect(
            buildPostMediaFields([
                { type: "image", kind: "existing", name: "kept.jpg" },
                { type: "image", kind: "file", file: newImage },
                {
                    type: "video",
                    kind: "existing",
                    name: "kept.mp4",
                    width: 640,
                    height: 360,
                },
                { type: "video", kind: "file", file: newVideo },
            ]),
        ).toEqual({
            keepImages: ["kept.jpg"],
            files: [newImage],
            keepThumbs: [],
            thumbs: [],
            keepVideos: ["kept.mp4"],
            videoFiles: [newVideo],
            mediaMeta: {
                images: [null, null],
                videos: [{ width: 640, height: 360 }, null],
            },
            order: [
                { type: "image", index: 0 },
                { type: "image", index: 1 },
                { type: "video", index: 0 },
                { type: "video", index: 1 },
            ],
        });
    });

    test("a new video before a kept photo still lands first", () => {
        expect(
            buildPostMediaFields([
                { type: "video", kind: "file", file: newVideo },
                { type: "image", kind: "existing", name: "kept.jpg" },
            ]).order,
        ).toEqual([
            { type: "video", index: 0 },
            { type: "image", index: 0 },
        ]);
    });

    test("aligns media_meta with the stored arrays, not composer order", () => {
        expect(
            buildPostMediaFields([
                {
                    type: "image",
                    kind: "file",
                    file: newImage,
                    width: 300,
                    height: 400,
                },
                {
                    type: "image",
                    kind: "existing",
                    name: "kept.jpg",
                    width: 100,
                    height: 200,
                },
            ]).mediaMeta,
        ).toEqual({
            // PocketBase stores the kept photo first, then the upload.
            images: [
                { width: 100, height: 200 },
                { width: 300, height: 400 },
            ],
            videos: [],
        });
    });

    test("collects existing and new thumbnails separately", () => {
        expect(
            buildPostMediaFields([
                {
                    type: "image",
                    kind: "existing",
                    name: "b2_main_x.webp",
                    thumb: "b2_thumbnail_y.webp",
                },
                {
                    type: "image",
                    kind: "file",
                    file: newImage,
                    thumb: newThumb,
                },
                // A photo whose thumbnail failed to encode is still uploaded.
                { type: "image", kind: "file", file: newImage, thumb: null },
            ]),
        ).toEqual({
            keepImages: ["b2_main_x.webp"],
            files: [newImage, newImage],
            keepThumbs: ["b2_thumbnail_y.webp"],
            thumbs: [newThumb],
            keepVideos: [],
            videoFiles: [],
            mediaMeta: { images: [null, null, null], videos: [] },
            order: [
                { type: "image", index: 0 },
                { type: "image", index: 1 },
                { type: "image", index: 2 },
            ],
        });
    });

    test("returns an empty payload when every item was removed", () => {
        expect(buildPostMediaFields([])).toEqual({
            keepImages: [],
            files: [],
            keepThumbs: [],
            thumbs: [],
            keepVideos: [],
            videoFiles: [],
            mediaMeta: { images: [], videos: [] },
            order: [],
        });
    });
});

describe("indexMediaByKind", () => {
    test("numbers photos and videos independently in one list", () => {
        expect(
            indexMediaByKind([
                { type: "image" },
                { type: "video" },
                { type: "image" },
                { type: "video" },
                { type: "video" },
            ]),
        ).toEqual([
            { item: { type: "image" }, index: 0 },
            { item: { type: "video" }, index: 0 },
            { item: { type: "image" }, index: 1 },
            { item: { type: "video" }, index: 1 },
            { item: { type: "video" }, index: 2 },
        ]);
    });

    test("returns an empty list for no media", () => {
        expect(indexMediaByKind([])).toEqual([]);
    });
});

describe("moveArrayItem", () => {
    const items = ["a", "b", "c", "d"];

    test("moves an item forward and backward", () => {
        expect(moveArrayItem(items, 0, 2)).toEqual(["b", "c", "a", "d"]);
        expect(moveArrayItem(items, 3, 1)).toEqual(["a", "d", "b", "c"]);
    });

    test("keeps the original array for no-ops and invalid indexes", () => {
        expect(moveArrayItem(items, 1, 1)).toBe(items);
        expect(moveArrayItem(items, -1, 2)).toBe(items);
        expect(moveArrayItem(items, 0, 4)).toBe(items);
    });

    test("does not mutate the input", () => {
        const moved = moveArrayItem(items, 1, 3);
        expect(items).toEqual(["a", "b", "c", "d"]);
        expect(moved).toEqual(["a", "c", "d", "b"]);
    });
});

describe("sortTargetAt", () => {
    const slots = [
        { index: 0, left: 0, top: 0, right: 100, bottom: 100 },
        { index: 1, left: 108, top: 0, right: 208, bottom: 100 },
        { index: 2, left: 0, top: 108, right: 100, bottom: 208 },
    ];

    test("returns the slot under the pointer", () => {
        expect(sortTargetAt(slots, 10, 10)).toBe(0);
        expect(sortTargetAt(slots, 150, 50)).toBe(1);
        expect(sortTargetAt(slots, 50, 150)).toBe(2);
    });

    test("treats the slot edges as inside", () => {
        expect(sortTargetAt(slots, 100, 100)).toBe(0);
        expect(sortTargetAt(slots, 108, 0)).toBe(1);
    });

    test("returns null in the gap or outside the grid", () => {
        expect(sortTargetAt(slots, 104, 50)).toBeNull();
        expect(sortTargetAt(slots, -1, 50)).toBeNull();
        expect(sortTargetAt(slots, 50, 300)).toBeNull();
        expect(sortTargetAt([], 10, 10)).toBeNull();
    });
});
