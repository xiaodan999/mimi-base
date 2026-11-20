import { describe, expect, test } from "bun:test";

import { firstPages, renderScale } from "./pdf";

describe("renderScale", () => {
    test("keeps the long edge at 1280px", () => {
        expect(renderScale(595, 842)).toBeCloseTo(1280 / 842);
        expect(renderScale(4000, 3000)).toBeCloseTo(0.32);
    });

    test("never upscales beyond 2x", () => {
        expect(renderScale(100, 100)).toBe(2);
    });

    test("falls back for degenerate viewports", () => {
        expect(renderScale(0, 0)).toBe(1);
        expect(renderScale(Number.NaN, 10)).toBe(1);
    });
});

describe("firstPages", () => {
    test("clamps the limit to the document", () => {
        expect(firstPages(3, 10)).toEqual([1, 2, 3]);
        expect(firstPages(30, 4)).toEqual([1, 2, 3, 4]);
    });

    test("renders nothing for a zero or negative budget", () => {
        expect(firstPages(0, 10)).toEqual([]);
        expect(firstPages(-2, 10)).toEqual([]);
    });
});
