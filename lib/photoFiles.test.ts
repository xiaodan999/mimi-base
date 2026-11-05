import { describe, expect, test } from "bun:test";

import { pairThumbs, photoFileName, photoKey, photoToken } from "./photoFiles";

/** Deterministic `Math.random` stand-in: <random> only feeds the picker. */
function sequence(...values: number[]): () => number {
    let index = 0;
    return () => values[index++ % values.length] ?? 0;
}

describe("photoToken", () => {
    test("is ten characters and starts with a letter", () => {
        expect(photoToken(sequence(0))).toMatch(/^[a-z][a-z0-9]{9}$/);
        expect(photoToken(sequence(0.999))).toMatch(/^[a-z][a-z0-9]{9}$/);
    });

    test("never looks like a legacy timestamp filename", () => {
        for (const value of [0, 0.1, 0.5, 0.99]) {
            expect(/^[a-z]/.test(photoToken(sequence(value)))).toBe(true);
        }
    });

    test("is stable for a fixed random source", () => {
        expect(photoToken(sequence(0))).toBe(photoToken(sequence(0)));
    });
});

describe("photoFileName", () => {
    test("marks the variant in the base name", () => {
        expect(photoFileName("k7f2m9x1p3", "main", "webp")).toBe(
            "k7f2m9x1p3_main.webp",
        );
        expect(photoFileName("k7f2m9x1p3", "thumbnail", "webp")).toBe(
            "k7f2m9x1p3_thumbnail.webp",
        );
    });
});

describe("photoKey", () => {
    test("reads the token from a stored name", () => {
        expect(photoKey("k7f2m9x1p3_main_ab12cd34ef.webp")).toBe("k7f2m9x1p3");
        expect(photoKey("k7f2m9x1p3_thumbnail_ab12cd34ef.webp")).toBe(
            "k7f2m9x1p3",
        );
    });

    test("still works for files uploaded before thumbnails existed", () => {
        expect(photoKey("1793858930076_0_r0e2o65fm9.webp")).toBe(
            "1793858930076",
        );
    });

    test("returns an empty key when there is no separator", () => {
        expect(photoKey("photo.webp")).toBe("photo");
        expect(photoKey("")).toBe("");
    });
});

describe("pairThumbs", () => {
    test("pairs by name regardless of list order", () => {
        expect(
            pairThumbs(
                ["a1_main_x.webp", "b2_main_y.webp"],
                ["b2_thumbnail_q.webp", "a1_thumbnail_p.webp"],
            ),
        ).toEqual([
            { name: "a1_main_x.webp", thumb: "a1_thumbnail_p.webp" },
            { name: "b2_main_y.webp", thumb: "b2_thumbnail_q.webp" },
        ]);
    });

    test("leaves an image without a thumb unpaired", () => {
        expect(pairThumbs(["a1_main_x.webp"], [])).toEqual([
            { name: "a1_main_x.webp" },
        ]);
        expect(pairThumbs(["a1_main_x.webp"], ["b2_thumbnail_q.webp"])).toEqual(
            [{ name: "a1_main_x.webp" }],
        );
    });

    test("ignores an orphan thumbnail", () => {
        expect(
            pairThumbs(
                ["a1_main_x.webp"],
                ["a1_thumbnail_p.webp", "c3_thumbnail_r.webp"],
            ),
        ).toEqual([{ name: "a1_main_x.webp", thumb: "a1_thumbnail_p.webp" }]);
    });

    test("legacy posts keep working without thumbs", () => {
        expect(
            pairThumbs(
                ["1793858930076_0_r0e.webp", "1793858931000_0_abc.webp"],
                [],
            ),
        ).toEqual([
            { name: "1793858930076_0_r0e.webp" },
            { name: "1793858931000_0_abc.webp" },
        ]);
    });

    test("keeps the first thumb when a key is duplicated", () => {
        expect(
            pairThumbs(
                ["a1_main_x.webp"],
                ["a1_thumbnail_first.webp", "a1_thumbnail_second.webp"],
            ),
        ).toEqual([
            { name: "a1_main_x.webp", thumb: "a1_thumbnail_first.webp" },
        ]);
    });
});
