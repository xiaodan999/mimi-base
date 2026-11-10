import { describe, expect, test } from "bun:test";

import {
    buildPostImagesFields,
    buildPostVideoFields,
    formatMonthLabel,
    groupPostMonths,
    monthKeyOf,
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
        });
    });

    test("records sizes in the order PocketBase stores the files", () => {
        // Kept files first, new uploads after, matching the multipart order.
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
            null,
            { width: 300, height: 400 },
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
        });
    });

    test("returns an empty payload when every image was removed", () => {
        expect(buildPostImagesFields([])).toEqual({
            keep: [],
            files: [],
            keepThumbs: [],
            thumbs: [],
            meta: [],
        });
    });
});
