import { describe, expect, test } from "bun:test";

import {
    TWITTER_MEDIA_DEFAULT_ASPECT,
    TWITTER_MEDIA_MAX_ASPECT,
    TWITTER_MEDIA_MIN_ASPECT,
    twitterMediaAspect,
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
