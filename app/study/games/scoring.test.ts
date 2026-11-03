import { describe, expect, test } from "bun:test";

import { bloodScore, wardScore } from "./scoring";

describe("wardScore", () => {
    test("a perfect round is 100 points and 3 stars", () => {
        const result = wardScore({
            found: 8,
            total: 8,
            firstTry: 8,
            wrong: 0,
            timeLeft: 90,
        });
        expect(result.score).toBe(100);
        expect(result.stars).toBe(3);
    });

    test("finding everything with a few mistakes drops to 2 stars", () => {
        const result = wardScore({
            found: 8,
            total: 8,
            firstTry: 6,
            wrong: 1,
            timeLeft: 40,
        });
        expect(result.stars).toBe(2);
        expect(result.score).toBeLessThan(100);
    });

    test("finding most hazards but not all still earns one star", () => {
        const result = wardScore({
            found: 5,
            total: 8,
            firstTry: 4,
            wrong: 2,
            timeLeft: 10,
        });
        expect(result.stars).toBe(1);
    });

    test("finding fewer than 60% earns no star", () => {
        const result = wardScore({
            found: 3,
            total: 8,
            firstTry: 3,
            wrong: 0,
            timeLeft: 0,
        });
        expect(result.stars).toBe(0);
        expect(result.score).toBeLessThan(40);
    });
});

describe("bloodScore", () => {
    test("a clean run under five minutes is 100 points and 3 stars", () => {
        const result = bloodScore({ nearMiss: 0, seconds: 200 });
        expect(result.score).toBe(100);
        expect(result.stars).toBe(3);
    });

    test("each near miss costs a star", () => {
        expect(bloodScore({ nearMiss: 1, seconds: 200 }).stars).toBe(2);
        expect(bloodScore({ nearMiss: 2, seconds: 200 }).stars).toBe(1);
    });

    test("three near misses is a patient safety event", () => {
        const result = bloodScore({ nearMiss: 3, seconds: 200 });
        expect(result.score).toBe(0);
        expect(result.stars).toBe(0);
    });

    test("overtime lowers the score but keeps a floor", () => {
        const result = bloodScore({ nearMiss: 0, seconds: 900 });
        expect(result.score).toBeLessThan(100);
        expect(result.score).toBeGreaterThanOrEqual(40);
    });

    test("an unfinished run cannot earn stars", () => {
        const result = bloodScore({
            nearMiss: 0,
            seconds: 100,
            cleared: 4,
            total: 7,
        });
        expect(result.stars).toBe(0);
        expect(result.score).toBe(40);
    });
});
