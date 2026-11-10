import { describe, expect, test } from "bun:test";

import {
    TWITTER_MEDIA_DEFAULT_ASPECT,
    TWITTER_MEDIA_MAX_ASPECT,
    TWITTER_MEDIA_MIN_ASPECT,
    TWITTER_NATURAL_MAX_ASPECT,
    TWITTER_NATURAL_MIN_ASPECT,
    twitterMediaAspect,
    twitterNaturalAspect,
} from "./post-images";

describe("twitterMediaAspect", () => {
    test("keeps a normal photo's ratio", () => {
        expect(twitterMediaAspect(1200, 900)).toBeCloseTo(4 / 3);
        expect(twitterMediaAspect(900, 1200)).toBeCloseTo(3 / 4);
    });

    test("clamps portrait and landscape extremes", () => {
        expect(twitterMediaAspect(900, 2400)).toBe(TWITTER_MEDIA_MIN_ASPECT);
        expect(twitterMediaAspect(4000, 900)).toBe(TWITTER_MEDIA_MAX_ASPECT);
    });

    test("falls back for missing or invalid sizes", () => {
        expect(twitterMediaAspect(0, 1200)).toBe(TWITTER_MEDIA_DEFAULT_ASPECT);
        expect(twitterMediaAspect(1200, 0)).toBe(TWITTER_MEDIA_DEFAULT_ASPECT);
        expect(twitterMediaAspect(Number.NaN, 1200)).toBe(
            TWITTER_MEDIA_DEFAULT_ASPECT,
        );
        expect(twitterMediaAspect(Number.POSITIVE_INFINITY, 1)).toBe(
            TWITTER_MEDIA_DEFAULT_ASPECT,
        );
    });
});

describe("twitterNaturalAspect", () => {
    test("keeps a 9:16 phone screenshot as-is", () => {
        expect(twitterNaturalAspect(1080, 1920)).toBeCloseTo(1080 / 1920);
    });

    test("keeps ordinary portrait, square and landscape photos", () => {
        expect(twitterNaturalAspect(900, 1200)).toBeCloseTo(3 / 4);
        expect(twitterNaturalAspect(1000, 1000)).toBe(1);
        expect(twitterNaturalAspect(1600, 900)).toBeCloseTo(16 / 9);
    });

    test("caps only genuinely extreme panoramas", () => {
        expect(twitterNaturalAspect(300, 2400)).toBe(
            TWITTER_NATURAL_MIN_ASPECT,
        );
        expect(twitterNaturalAspect(4000, 300)).toBe(
            TWITTER_NATURAL_MAX_ASPECT,
        );
    });

    test("falls back for missing or invalid sizes", () => {
        expect(twitterNaturalAspect(0, 1200)).toBe(
            TWITTER_MEDIA_DEFAULT_ASPECT,
        );
        expect(twitterNaturalAspect(1200, Number.NaN)).toBe(
            TWITTER_MEDIA_DEFAULT_ASPECT,
        );
    });
});
