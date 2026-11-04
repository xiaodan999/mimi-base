import { describe, expect, test } from "bun:test";

import { clampOffset, coverScale, cropRect } from "./crop";

describe("coverScale", () => {
    test("landscape images scale by width", () => {
        expect(coverScale(200, 1000, 500)).toBeCloseTo(0.4);
    });

    test("portrait images scale by height", () => {
        expect(coverScale(200, 500, 1000)).toBeCloseTo(0.4);
    });

    test("square images scale to the viewport", () => {
        expect(coverScale(200, 400, 400)).toBeCloseTo(0.5);
    });

    test("unsized images return 0", () => {
        expect(coverScale(200, 0, 0)).toBe(0);
        expect(coverScale(0, 100, 100)).toBe(0);
    });
});

describe("clampOffset", () => {
    test("centered offset is unchanged", () => {
        expect(clampOffset({ x: 0, y: 0 }, 200, 400, 400, 1)).toEqual({
            x: 0,
            y: 0,
        });
    });

    test("dragging past the edge clamps to the overflow", () => {
        // 400px source at scale 0.5 covers exactly the 200px viewport, so
        // there is no room to pan at zoom 1.
        expect(clampOffset({ x: 90, y: -90 }, 200, 400, 400, 1)).toEqual({
            x: 0,
            y: 0,
        });
    });

    test("zoom gives room to pan", () => {
        const offset = clampOffset({ x: 500, y: -500 }, 200, 400, 400, 2);
        expect(offset.x).toBeCloseTo(100);
        expect(offset.y).toBeCloseTo(-100);
    });

    test("wide images pan horizontally only", () => {
        const offset = clampOffset({ x: -999, y: 999 }, 200, 400, 200, 1);
        expect(offset.x).toBeCloseTo(-100);
        expect(offset.y).toBe(0);
    });
});

describe("cropRect", () => {
    test("centered landscape crops the middle square", () => {
        const rect = cropRect(
            { viewport: 200, naturalWidth: 800, naturalHeight: 400, zoom: 1 },
            { x: 0, y: 0 },
        );
        expect(rect.sw).toBeCloseTo(400);
        expect(rect.sh).toBeCloseTo(400);
        expect(rect.sx).toBeCloseTo(200);
        expect(rect.sy).toBeCloseTo(0);
    });

    test("panning to the left edge selects the left square", () => {
        const rect = cropRect(
            { viewport: 200, naturalWidth: 800, naturalHeight: 400, zoom: 1 },
            { x: 200, y: 0 },
        );
        expect(rect.sx).toBeCloseTo(0);
    });

    test("zoom shrinks the source window", () => {
        const rect = cropRect(
            { viewport: 200, naturalWidth: 800, naturalHeight: 400, zoom: 2 },
            { x: 0, y: 0 },
        );
        expect(rect.sw).toBeCloseTo(200);
        expect(rect.sx).toBeCloseTo(300);
    });

    test("clamps the source window inside the image", () => {
        const rect = cropRect(
            { viewport: 200, naturalWidth: 800, naturalHeight: 400, zoom: 2 },
            { x: 9999, y: -9999 },
        );
        expect(rect.sx).toBeGreaterThanOrEqual(0);
        expect(rect.sy).toBeGreaterThanOrEqual(0);
        expect(rect.sx + rect.sw).toBeLessThanOrEqual(800);
        expect(rect.sy + rect.sh).toBeLessThanOrEqual(400);
    });
});
