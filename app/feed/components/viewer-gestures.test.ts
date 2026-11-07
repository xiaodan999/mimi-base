import { describe, expect, test } from "bun:test";

import {
    clampScale,
    clampTranslation,
    midpoint,
    panLimits,
    resolveSwipe,
    shouldDismiss,
    zoomAtPoint,
} from "./viewer-gestures";

const viewport = { width: 400, height: 800 };
/** A portrait image that fits the viewport height at scale 1. */
const base = { width: 300, height: 800 };

describe("panLimits", () => {
    test("is zero while the image still fits the viewport", () => {
        expect(panLimits(1, base, viewport)).toEqual({ x: 0, y: 0 });
    });

    test("grows with the overflowing edges when zoomed", () => {
        expect(panLimits(2, base, viewport)).toEqual({ x: 100, y: 400 });
    });
});

describe("clampTranslation", () => {
    test("keeps a fitted image centred", () => {
        expect(
            clampTranslation({ scale: 1, x: 40, y: -90 }, base, viewport),
        ).toEqual({ scale: 1, x: 0, y: 0 });
    });

    test("allows panning across the overflow when zoomed", () => {
        const result = clampTranslation(
            { scale: 2, x: 999, y: -999 },
            base,
            viewport,
        );
        // 300*2 - 400 = 200 -> 100 each side.
        expect(result.x).toBe(100);
        // 800*2 - 800 = 800 -> 400 each side.
        expect(result.y).toBe(-400);
    });
});

describe("zoomAtPoint", () => {
    test("keeps a centred tap centred", () => {
        const next = zoomAtPoint(
            { scale: 1, x: 0, y: 0 },
            { x: 0, y: 0 },
            2.5,
            base,
            viewport,
        );
        expect(next.scale).toBe(2.5);
        expect(next.x).toBe(0);
        expect(next.y).toBe(0);
    });

    test("pins the tapped point while zooming in", () => {
        const point = { x: 80, y: -120 };
        const before = { scale: 1, x: 0, y: 0 };
        const after = zoomAtPoint(before, point, 2, base, viewport);
        const ratio = after.scale / before.scale;

        // The content under the finger must map back to the same point.
        expect(after.x + ratio * (point.x - before.x)).toBeCloseTo(point.x);
        expect(after.y + ratio * (point.y - before.y)).toBeCloseTo(point.y);
    });

    test("never zooms beyond the allowed range", () => {
        expect(
            zoomAtPoint(
                { scale: 1, x: 0, y: 0 },
                { x: 0, y: 0 },
                99,
                base,
                viewport,
            ).scale,
        ).toBe(4);
        expect(clampScale(0.2)).toBe(1);
    });
});

describe("resolveSwipe", () => {
    test("ignores a short, slow drag", () => {
        expect(resolveSwipe(-20, -0.1, 400)).toBe(0);
    });

    test("a long drag to the left goes to the next image", () => {
        expect(resolveSwipe(-100, -0.2, 400)).toBe(1);
    });

    test("a long drag to the right goes to the previous image", () => {
        expect(resolveSwipe(100, 0.2, 400)).toBe(-1);
    });

    test("a quick flick commits even over a short distance", () => {
        expect(resolveSwipe(-40, -0.9, 400)).toBe(1);
        expect(resolveSwipe(40, 0.9, 400)).toBe(-1);
    });
});

describe("shouldDismiss", () => {
    test("needs either enough travel or a downward fling", () => {
        expect(shouldDismiss(40, 0.1)).toBe(false);
        expect(shouldDismiss(120, 0.1)).toBe(true);
        expect(shouldDismiss(50, 0.8)).toBe(true);
    });
});

describe("midpoint", () => {
    test("averages two touches", () => {
        expect(midpoint({ x: 10, y: 20 }, { x: 30, y: 40 })).toEqual({
            x: 20,
            y: 30,
        });
    });
});

describe("clampScale", () => {
    test("stays within the zoom range", () => {
        expect(clampScale(2.5)).toBe(2.5);
        expect(clampScale(-1)).toBe(1);
        expect(clampScale(10)).toBe(4);
    });
});

// A zoomed image must be pannable inside its overflow, but never far enough
// to reveal the background around an edge.
test("a zoomed image pans up to its overflowing edges", () => {
    const zoomed = { scale: 2, x: 50, y: -120 };
    expect(clampTranslation(zoomed, base, viewport)).toEqual(zoomed);
    expect(clampTranslation({ ...zoomed, x: 140 }, base, viewport).x).toBe(100);
    expect(clampTranslation({ ...zoomed, y: -900 }, base, viewport).y).toBe(
        -400,
    );
});
