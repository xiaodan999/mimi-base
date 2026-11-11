import { describe, expect, test } from "bun:test";

import {
    TWITTER_MEDIA_DEFAULT_ASPECT,
    TWITTER_MEDIA_MAX_ASPECT,
    TWITTER_MEDIA_MIN_ASPECT,
    TWITTER_NATURAL_MAX_ASPECT,
    TWITTER_NATURAL_MIN_ASPECT,
    TWITTER_PAIR_MAX_ASPECT_SUM,
    twitterMediaAspect,
    twitterMediaPlan,
    twitterNaturalAspect,
    twitterPairFits,
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

describe("twitterPairFits", () => {
    test("keeps two portrait photos in X's side-by-side pair", () => {
        // Measured on x.com: a 3:4 pair rendered at half width each.
        expect(twitterPairFits(3 / 4, 3 / 4)).toBe(true);
    });

    test("keeps a tall portrait next to a landscape", () => {
        // x.com's 313x680 + 240x199 pair stayed side by side.
        expect(twitterPairFits(313 / 680, 240 / 199)).toBe(true);
    });

    test("sends two landscape photos to the swipe strip", () => {
        // x.com's 240x203 + 240x207 pair became two 80% slides.
        expect(twitterPairFits(240 / 203, 240 / 207)).toBe(false);
        expect(twitterPairFits(4 / 3, 4 / 3)).toBe(false);
    });

    test("the cutoff is the summed aspect, inclusive", () => {
        const half = TWITTER_PAIR_MAX_ASPECT_SUM / 2;
        expect(twitterPairFits(half, half)).toBe(true);
        expect(twitterPairFits(half, half + 0.01)).toBe(false);
    });

    test("unknown sizes keep the pair instead of guessing", () => {
        expect(twitterPairFits(0, 1)).toBe(true);
        expect(twitterPairFits(1, Number.NaN)).toBe(true);
    });
});

describe("twitterMediaPlan", () => {
    test("one photo and one video share X's row", () => {
        // Measured on x.com: a 680x313 photo and a 480x852 video sat side by
        // side at one height (a 2.74 box), not stacked and not in the strip.
        expect(
            twitterMediaPlan({
                imageCount: 1,
                videoCount: 1,
                pairFits: false,
            }),
        ).toBe("pair");
    });

    test("more photos plus a video become the strip", () => {
        expect(
            twitterMediaPlan({
                imageCount: 2,
                videoCount: 1,
                pairFits: false,
            }),
        ).toBe("strip");
        expect(
            twitterMediaPlan({ imageCount: 5, videoCount: 1, pairFits: true }),
        ).toBe("strip");
    });

    test("two or more videos always use the strip", () => {
        expect(
            twitterMediaPlan({ imageCount: 1, videoCount: 2, pairFits: true }),
        ).toBe("strip");
        expect(
            twitterMediaPlan({ imageCount: 0, videoCount: 2, pairFits: true }),
        ).toBe("strip");
        expect(
            twitterMediaPlan({ imageCount: 3, videoCount: 3, pairFits: true }),
        ).toBe("strip");
    });

    test("a lone photo, or the video alone, is the single layout", () => {
        expect(
            twitterMediaPlan({
                imageCount: 1,
                videoCount: 0,
                pairFits: true,
            }),
        ).toBe("single");
        expect(
            twitterMediaPlan({ imageCount: 0, videoCount: 1, pairFits: true }),
        ).toBe("single");
    });

    test("photo-only sets keep the existing pair/strip rule", () => {
        expect(
            twitterMediaPlan({
                imageCount: 2,
                videoCount: 0,
                pairFits: true,
            }),
        ).toBe("pair");
        expect(
            twitterMediaPlan({
                imageCount: 2,
                videoCount: 0,
                pairFits: false,
            }),
        ).toBe("strip");
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
