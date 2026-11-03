import { describe, expect, test } from "bun:test";

import { SKIN_CASES, STAGE_OPTIONS } from "./cases";
import {
    CASE_POINTS,
    STAGE_POINTS,
    TREATMENT_POINTS,
    casePoints,
    scoreCases,
    scoreSkinRun,
    type CaseVerdict,
} from "./scoring";

function run(stageOk: boolean, treatmentOk: boolean, count = 6): CaseVerdict[] {
    return Array.from({ length: count }, () => ({ stageOk, treatmentOk }));
}

describe("casePoints", () => {
    test("a case is worth 100 points split between stage and treatment", () => {
        expect(CASE_POINTS).toBe(100);
        expect(STAGE_POINTS + TREATMENT_POINTS).toBe(CASE_POINTS);
        expect(casePoints({ stageOk: true, treatmentOk: true })).toBe(100);
        expect(casePoints({ stageOk: true, treatmentOk: false })).toBe(50);
        expect(casePoints({ stageOk: false, treatmentOk: true })).toBe(50);
        expect(casePoints({ stageOk: false, treatmentOk: false })).toBe(0);
    });
});

describe("SKIN_CASES", () => {
    test("covers all six pressure-injury stages", () => {
        expect(SKIN_CASES).toHaveLength(6);
        expect(SKIN_CASES.map((item) => item.stage)).toEqual([
            "1",
            "2",
            "3",
            "4",
            "u",
            "d",
        ]);
        expect(STAGE_OPTIONS.map((option) => option.key)).toEqual([
            "1",
            "2",
            "3",
            "4",
            "u",
            "d",
        ]);
    });

    test("each case offers four unique treatments including the correct one", () => {
        for (const item of SKIN_CASES) {
            expect(item.treatmentOptions).toHaveLength(4);
            expect(new Set(item.treatmentOptions).size).toBe(4);
            expect(item.treatmentOptions).toContain(item.correctTreatment);
            for (const treatment of item.treatmentOptions) {
                if (treatment === item.correctTreatment) continue;
                expect(item.wrongWhys[treatment]?.length ?? 0).toBeGreaterThan(
                    0,
                );
            }
            expect(item.probe.tissue.length).toBeGreaterThan(0);
            expect(item.wound.depthLabel.length).toBeGreaterThan(0);
        }
    });
});

describe("scoreSkinRun", () => {
    test("a perfect six-case run is 100 points and 3 stars", () => {
        const result = scoreSkinRun(run(true, true));
        expect(result.score).toBe(100);
        expect(result.stars).toBe(3);
        expect(result.stageCorrect).toBe(6);
        expect(result.treatmentCorrect).toBe(6);
        expect(result.perfect).toBe(true);
        expect(result.totalStages).toBe(6);
        expect(result.totalTreatments).toBe(6);
    });

    test("a worst run is 0 points and 0 stars", () => {
        const result = scoreSkinRun(run(false, false));
        expect(result.score).toBe(0);
        expect(result.stars).toBe(0);
        expect(result.stageCorrect).toBe(0);
        expect(result.treatmentCorrect).toBe(0);
        expect(result.perfect).toBe(false);
    });

    test("one wrong treatment still loses a star", () => {
        const verdicts = run(true, true);
        verdicts[2] = { stageOk: true, treatmentOk: false };
        const result = scoreSkinRun(verdicts);
        expect(result.score).toBe(92);
        expect(result.stars).toBe(2);
        expect(result.stageCorrect).toBe(6);
        expect(result.treatmentCorrect).toBe(5);
        expect(result.perfect).toBe(false);
    });

    test("one wrong stage is also 92 points and 2 stars", () => {
        const verdicts = run(true, true);
        verdicts[0] = { stageOk: false, treatmentOk: true };
        const result = scoreSkinRun(verdicts);
        expect(result.score).toBe(92);
        expect(result.stars).toBe(2);
        expect(result.stageCorrect).toBe(5);
        expect(result.treatmentCorrect).toBe(6);
    });

    test("perfect staging with wrong treatments is 50 points and 1 star", () => {
        const result = scoreSkinRun(run(true, false));
        expect(result.score).toBe(50);
        expect(result.stars).toBe(1);
        expect(result.stageCorrect).toBe(6);
        expect(result.treatmentCorrect).toBe(0);
    });

    test("ten of twelve correct parts stays at 2 stars", () => {
        const verdicts: CaseVerdict[] = [
            { stageOk: true, treatmentOk: true },
            { stageOk: true, treatmentOk: true },
            { stageOk: true, treatmentOk: true },
            { stageOk: true, treatmentOk: true },
            { stageOk: true, treatmentOk: false },
            { stageOk: false, treatmentOk: true },
        ];
        const result = scoreSkinRun(verdicts);
        expect(result.score).toBe(83);
        expect(result.stars).toBe(2);
    });

    test("half of the parts correct is 50 points and 1 star", () => {
        const verdicts: CaseVerdict[] = [
            { stageOk: true, treatmentOk: true },
            { stageOk: true, treatmentOk: true },
            { stageOk: true, treatmentOk: false },
            { stageOk: true, treatmentOk: false },
            { stageOk: false, treatmentOk: false },
            { stageOk: false, treatmentOk: false },
        ];
        const result = scoreSkinRun(verdicts);
        expect(result.score).toBe(50);
        expect(result.stars).toBe(1);
    });

    test("an empty run does not divide by zero", () => {
        const result = scoreSkinRun([]);
        expect(result.score).toBe(0);
        expect(result.stars).toBe(0);
        expect(result.perfect).toBe(false);
        expect(result.totalStages).toBe(0);
    });

    test("scoreCases adds per-case points", () => {
        const rows = scoreCases([
            { stageOk: true, treatmentOk: false },
            { stageOk: false, treatmentOk: true },
            { stageOk: true, treatmentOk: true },
        ]);
        expect(rows.map((row) => row.points)).toEqual([50, 50, 100]);
    });
});
