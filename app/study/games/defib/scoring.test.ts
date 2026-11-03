import { describe, expect, test } from "bun:test";

import {
    LEAD_DEFS,
    LEAD_ZONES,
    PAD_TARGETS,
    PAD_ZONES,
    SHOCK_STEPS,
} from "./data";
import {
    BEAT_GOOD_MS,
    BEAT_PERFECT_MS,
    CPR_BPM,
    defibScore,
    gradeBeatDelta,
    rhythmBeatCount,
    rhythmBeatInterval,
    scoreRhythm,
    type DefibScoreInput,
} from "./scoring";

function onBeat(count: number, bpm = CPR_BPM): number[] {
    const interval = rhythmBeatInterval(bpm);
    return Array.from({ length: count }, (_, index) => index * interval);
}

const perfectRun: DefibScoreInput = {
    leadsClean: 5,
    padsClean: 2,
    rhythmAccuracy: 1,
    rhythmQuality: 1,
    sequenceMistakes: 0,
    sequenceCompleted: true,
    completed: true,
};

describe("correct anatomy", () => {
    test("five leads match the five expected surface positions", () => {
        expect(LEAD_DEFS.map((lead) => lead.targetLabel)).toEqual([
            "右锁骨下",
            "左锁骨下",
            "右下腹",
            "左下腹",
            "胸部",
        ]);
    });

    test("two defib pads use the right second and left fifth intercostal", () => {
        expect(PAD_TARGETS.map((target) => target.label)).toEqual([
            "右锁骨中线第 2 肋间",
            "左腋前线第 5 肋间",
        ]);
    });

    test("every lead points at a matching clickable body zone", () => {
        for (const lead of LEAD_DEFS) {
            const zone = LEAD_ZONES.find((item) => item.id === lead.targetZone);
            expect(zone?.lead).toBe(lead.id);
        }
    });

    test("the pad target zones are present in the pad scene", () => {
        for (const target of PAD_TARGETS) {
            expect(PAD_ZONES.some((zone) => zone.id === target.id)).toBe(true);
        }
    });

    test("the shock sequence is charge, clear, shock", () => {
        expect(SHOCK_STEPS.map((step) => step.label)).toEqual([
            "充电",
            "所有人离开",
            "放电",
        ]);
    });
});

describe("beat grading", () => {
    test("the perfect window is ±90ms and good is ±200ms", () => {
        expect(gradeBeatDelta(0)).toBe("perfect");
        expect(gradeBeatDelta(BEAT_PERFECT_MS)).toBe("perfect");
        expect(gradeBeatDelta(-BEAT_PERFECT_MS)).toBe("perfect");
        expect(gradeBeatDelta(BEAT_PERFECT_MS + 1)).toBe("good");
        expect(gradeBeatDelta(-BEAT_GOOD_MS)).toBe("good");
        expect(gradeBeatDelta(BEAT_GOOD_MS + 1)).toBe("miss");
        expect(gradeBeatDelta(-500)).toBe("miss");
    });

    test("30 seconds at 110/min is 55 beats", () => {
        expect(CPR_BPM).toBe(110);
        expect(rhythmBeatCount()).toBe(55);
        expect(rhythmBeatInterval()).toBeGreaterThan(500);
        expect(rhythmBeatInterval()).toBeLessThan(600);
    });
});

describe("scoreRhythm", () => {
    test("a perfect run hits every beat", () => {
        const result = scoreRhythm(onBeat(55));
        expect(result.beats).toBe(55);
        expect(result.perfect).toBe(55);
        expect(result.good).toBe(0);
        expect(result.miss).toBe(0);
        expect(result.extra).toBe(0);
        expect(result.hits).toBe(55);
        expect(result.accuracy).toBe(1);
        expect(result.quality).toBe(1);
        expect(result.score).toBe(100);
    });

    test("taps 150ms late are all good, not perfect", () => {
        const result = scoreRhythm(onBeat(55).map((tap) => tap + 150));
        expect(result.perfect).toBe(0);
        expect(result.good).toBe(55);
        expect(result.miss).toBe(0);
        expect(result.accuracy).toBe(1);
        expect(Math.round(result.quality * 100)).toBe(60);
        expect(result.score).toBe(60);
    });

    test("untouched beats are misses", () => {
        const result = scoreRhythm(onBeat(10));
        expect(result.perfect).toBe(10);
        expect(result.hits).toBe(10);
        expect(result.miss).toBe(45);
        expect(result.extra).toBe(0);
        expect(result.accuracy).toBeGreaterThan(0.18);
        expect(result.accuracy).toBeLessThan(0.19);
    });

    test("an extra tap does not claim the same beat twice", () => {
        const beats = onBeat(2);
        const result = scoreRhythm([beats[0], beats[0] + 100, beats[1]]);
        expect(result.perfect).toBe(2);
        expect(result.hits).toBe(2);
        expect(result.miss).toBe(53);
        expect(result.extra).toBe(1);
        expect(result.accuracy).toBeLessThan(0.04);
    });

    test("no taps scores zero", () => {
        const result = scoreRhythm([]);
        expect(result.hits).toBe(0);
        expect(result.miss).toBe(55);
        expect(result.accuracy).toBe(0);
        expect(result.score).toBe(0);
    });

    test("duration and bpm are configurable for tests", () => {
        const result = scoreRhythm(onBeat(20, 120), {
            durationMs: 10_000,
            bpm: 120,
        });
        expect(result.beats).toBe(20);
        expect(result.perfect).toBe(20);
        expect(result.accuracy).toBe(1);
    });
});

describe("defibScore", () => {
    test("a flawless run is 100 points and three stars", () => {
        const result = defibScore(perfectRun);
        expect(result.score).toBe(100);
        expect(result.stars).toBe(3);
        expect(result.placementRatio).toBe(1);
        expect(result.sequenceRatio).toBe(1);
    });

    test("placement mistakes lower the score and cap the stars", () => {
        const result = defibScore({
            ...perfectRun,
            leadsClean: 4,
            padsClean: 1,
            rhythmAccuracy: 0.9,
            rhythmQuality: 0.9,
        });
        expect(result.placementRatio).toBeGreaterThan(0.71);
        expect(result.placementRatio).toBeLessThan(0.72);
        expect(result.score).toBe(82);
        expect(result.stars).toBe(2);
    });

    test("three stars need at least 85% rhythm accuracy", () => {
        const exact = defibScore({
            ...perfectRun,
            rhythmAccuracy: 0.85,
            rhythmQuality: 0.85,
        });
        expect(exact.stars).toBe(3);
        expect(exact.score).toBe(95);

        const below = defibScore({
            ...perfectRun,
            rhythmAccuracy: 0.84,
            rhythmQuality: 0.84,
        });
        expect(below.stars).toBe(2);
        expect(below.score).toBe(94);
    });

    test("two stars need at least 60% rhythm accuracy", () => {
        const twoStar = defibScore({
            ...perfectRun,
            rhythmAccuracy: 0.6,
            rhythmQuality: 0.6,
        });
        expect(twoStar.stars).toBe(2);
        expect(twoStar.score).toBe(86);

        const oneStar = defibScore({
            ...perfectRun,
            rhythmAccuracy: 0.59,
            rhythmQuality: 0.59,
        });
        expect(oneStar.stars).toBe(1);
        expect(oneStar.score).toBe(86);
    });

    test("a wrong shock order can still leave two stars at most", () => {
        const once = defibScore({
            ...perfectRun,
            sequenceMistakes: 1,
        });
        expect(once.sequenceRatio).toBeGreaterThan(0.65);
        expect(once.sequenceRatio).toBeLessThan(0.67);
        expect(once.score).toBe(95);
        expect(once.stars).toBe(2);

        const twice = defibScore({
            ...perfectRun,
            sequenceMistakes: 2,
        });
        expect(twice.score).toBe(90);
        expect(twice.stars).toBe(1);
    });

    test("an unfinished shock sequence cannot earn three stars", () => {
        const result = defibScore({
            ...perfectRun,
            sequenceCompleted: false,
        });
        expect(result.sequenceRatio).toBe(0);
        expect(result.score).toBe(85);
        expect(result.stars).toBe(1);
    });

    test("too many placement mistakes drop to one star", () => {
        const result = defibScore({
            ...perfectRun,
            leadsClean: 3,
            padsClean: 1,
            rhythmAccuracy: 0.9,
            rhythmQuality: 0.9,
        });
        expect(result.placementRatio).toBeLessThan(0.6);
        expect(result.stars).toBe(1);
    });

    test("an incomplete run cannot earn stars", () => {
        const result = defibScore({ ...perfectRun, completed: false });
        expect(result.score).toBe(100);
        expect(result.stars).toBe(0);
    });

    test("inputs are clamped instead of exceeding the scale", () => {
        const result = defibScore({
            ...perfectRun,
            leadsClean: 99,
            padsClean: 99,
            rhythmAccuracy: 2,
            rhythmQuality: 2,
        });
        expect(result.score).toBe(100);
        expect(result.placementRatio).toBe(1);
        expect(result.rhythmQuality).toBe(1);
        expect(result.stars).toBe(3);
    });
});
