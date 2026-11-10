import { describe, expect, test } from "bun:test";

import {
    buildPostImagesFields,
    buildPostVideoFields,
    formatMonthLabel,
    groupPostMonths,
    mapStoredImageOrder,
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

describe("buildPostVideoFields", () => {
    const video = new File(["clip"], "clip.mp4", { type: "video/mp4" });

    test("keeps an uploaded video by filename when editing", () => {
        expect(
            buildPostVideoFields({ kind: "existing", name: "clip_123.mp4" }),
        ).toEqual({ keep: ["clip_123.mp4"], files: [], size: null });
    });

    test("uploads a newly picked video", () => {
        expect(buildPostVideoFields({ kind: "file", file: video })).toEqual({
            keep: [],
            files: [video],
            size: null,
        });
    });

    test("carries the intrinsic size for the reserved box", () => {
        expect(
            buildPostVideoFields({
                kind: "file",
                file: video,
                width: 1280,
                height: 720,
            }),
        ).toEqual({
            keep: [],
            files: [video],
            size: { width: 1280, height: 720 },
        });
    });

    test("returns empty lists when the video was removed", () => {
        expect(buildPostVideoFields(null)).toEqual({
            keep: [],
            files: [],
            size: null,
        });
    });
});

describe("buildPostImagesFields", () => {
    const newFile = new File(["new"], "a1_main.webp", { type: "image/webp" });
    const newThumb = new File(["thumb"], "a1_thumbnail.webp", {
        type: "image/webp",
    });

    test("keeps existing names and new files in visual order", () => {
        expect(
            buildPostImagesFields([
                { kind: "existing", name: "kept-1.jpg" },
                { kind: "file", file: newFile },
                { kind: "existing", name: "kept-2.jpg" },
            ]),
        ).toEqual({
            keep: ["kept-1.jpg", "kept-2.jpg"],
            files: [newFile],
            keepThumbs: [],
            thumbs: [],
            meta: [null, null, null],
            order: [
                { kind: "existing", index: 0 },
                { kind: "file", index: 0 },
                { kind: "existing", index: 1 },
            ],
        });
    });

    test("records sizes in the composer's visual order", () => {
        expect(
            buildPostImagesFields([
                {
                    kind: "existing",
                    name: "kept-1.jpg",
                    width: 100,
                    height: 200,
                },
                {
                    kind: "file",
                    file: newFile,
                    width: 300,
                    height: 400,
                },
                { kind: "existing", name: "kept-2.jpg" },
            ]).meta,
        ).toEqual([
            { width: 100, height: 200 },
            { width: 300, height: 400 },
            null,
        ]);
    });

    test("collects existing and new thumbnails separately", () => {
        expect(
            buildPostImagesFields([
                {
                    kind: "existing",
                    name: "b2_main_x.webp",
                    thumb: "b2_thumbnail_y.webp",
                },
                { kind: "file", file: newFile, thumb: newThumb },
                // A photo whose thumbnail failed to encode is still uploaded.
                { kind: "file", file: newFile, thumb: null },
            ]),
        ).toEqual({
            keep: ["b2_main_x.webp"],
            files: [newFile, newFile],
            keepThumbs: ["b2_thumbnail_y.webp"],
            thumbs: [newThumb],
            meta: [null, null, null],
            order: [
                { kind: "existing", index: 0 },
                { kind: "file", index: 0 },
                { kind: "file", index: 1 },
            ],
        });
    });

    test("returns an empty payload when every image was removed", () => {
        expect(buildPostImagesFields([])).toEqual({
            keep: [],
            files: [],
            keepThumbs: [],
            thumbs: [],
            meta: [],
            order: [],
        });
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

describe("mapStoredImageOrder", () => {
    test("puts a new upload between two kept photos", () => {
        // Composer: kept B, new X, kept A. PocketBase stores B, A, X first.
        expect(
            mapStoredImageOrder(
                [
                    { kind: "existing", index: 0 },
                    { kind: "file", index: 0 },
                    { kind: "existing", index: 1 },
                ],
                ["B", "A"],
                ["B", "A", "X"],
            ),
        ).toEqual(["B", "X", "A"]);
    });

    test("keeps several new uploads in their upload order", () => {
        expect(
            mapStoredImageOrder(
                [
                    { kind: "file", index: 0 },
                    { kind: "existing", index: 0 },
                    { kind: "file", index: 1 },
                ],
                ["B"],
                ["B", "X", "Y"],
            ),
        ).toEqual(["X", "B", "Y"]);
    });

    test("returns null when the saved record is missing a file", () => {
        expect(
            mapStoredImageOrder(
                [
                    { kind: "existing", index: 0 },
                    { kind: "file", index: 0 },
                ],
                ["B"],
                ["B"],
            ),
        ).toBeNull();
        expect(
            mapStoredImageOrder([{ kind: "existing", index: 1 }], ["B"], ["B"]),
        ).toBeNull();
    });
});
