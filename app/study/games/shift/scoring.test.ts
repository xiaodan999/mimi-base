import { describe, expect, test } from "bun:test";

import { shiftScore } from "./scoring";

describe("shiftScore", () => {
    test("a perfect shift is 100 points and 3 stars", () => {
        const result = shiftScore({
            safety: 100,
            resolved: 8,
            total: 8,
            wrong: 0,
            missed: 0,
            timeLeft: 300,
        });
        expect(result.score).toBe(100);
        expect(result.stars).toBe(3);
    });

    test("lower patient safety lowers the score and the stars", () => {
        const high = shiftScore({
            safety: 100,
            resolved: 8,
            total: 8,
            wrong: 0,
            timeLeft: 0,
        });
        const low = shiftScore({
            safety: 40,
            resolved: 8,
            total: 8,
            wrong: 0,
            timeLeft: 0,
        });

        expect(high.score).toBe(100);
        expect(low.score).toBeLessThan(high.score);
        expect(low.stars).toBeLessThan(high.stars);
    });

    test("ignored events lower the score and can remove stars", () => {
        const all = shiftScore({
            safety: 100,
            resolved: 8,
            total: 8,
            wrong: 0,
            missed: 0,
            timeLeft: 0,
        });
        const ignored = shiftScore({
            safety: 100,
            resolved: 5,
            total: 8,
            wrong: 0,
            missed: 3,
            timeLeft: 0,
        });
        const tooMany = shiftScore({
            safety: 100,
            resolved: 4,
            total: 8,
            wrong: 0,
            missed: 4,
            timeLeft: 0,
        });

        expect(ignored.score).toBeLessThan(all.score);
        expect(ignored.stars).toBe(1);
        expect(tooMany.stars).toBe(0);
    });

    test("a couple of wrong attempts still allows a two-star shift", () => {
        const result = shiftScore({
            safety: 84,
            resolved: 8,
            total: 8,
            wrong: 2,
            missed: 0,
            timeLeft: 0,
        });
        expect(result.stars).toBe(2);
        expect(result.score).toBeLessThan(100);
    });

    test("a patient safety event ends the shift with zero", () => {
        const failed = shiftScore({
            safety: 0,
            resolved: 6,
            total: 8,
            wrong: 1,
            missed: 2,
            failed: true,
        });
        expect(failed).toEqual({ score: 0, stars: 0 });

        // 即使调用方忘了传 failed，安全分归零也不能拿分
        expect(shiftScore({ safety: 0, resolved: 8, total: 8 }).score).toBe(0);
    });

    test("an incomplete shift without 60% resolved earns no star", () => {
        const result = shiftScore({
            safety: 70,
            resolved: 4,
            total: 8,
            wrong: 0,
            missed: 4,
            timeLeft: 0,
        });
        expect(result.stars).toBe(0);
        expect(result.score).toBeGreaterThan(0);
    });

    test("clamps out-of-range input", () => {
        const result = shiftScore({
            safety: 140,
            resolved: 20,
            total: 8,
            wrong: -3,
            missed: 0,
            timeLeft: 999,
        });
        expect(result.score).toBe(100);
        expect(result.stars).toBe(3);
    });
});
