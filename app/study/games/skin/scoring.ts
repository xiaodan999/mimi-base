/**
 * 《皮肤之下》的纯计分逻辑。
 *
 * 每个病例拆成「分期」和「处理」两项，各 50 分；六个病例共 12 项。
 * 不依赖 React / three，可以直接跑 bun test。
 */

import { starLadder } from "../../lib";

export type CaseVerdict = {
    stageOk: boolean;
    treatmentOk: boolean;
};

export type CaseScore = CaseVerdict & {
    points: number;
};

export const STAGE_POINTS = 50;
export const TREATMENT_POINTS = 50;
export const CASE_POINTS = STAGE_POINTS + TREATMENT_POINTS;

export function casePoints(verdict: CaseVerdict): number {
    return (
        (verdict.stageOk ? STAGE_POINTS : 0) +
        (verdict.treatmentOk ? TREATMENT_POINTS : 0)
    );
}

export type SkinScore = {
    /** 百分制总分 */
    score: number;
    stars: 0 | 1 | 2 | 3;
    stageCorrect: number;
    treatmentCorrect: number;
    totalStages: number;
    totalTreatments: number;
    /** 分期和处理全部正确 */
    perfect: boolean;
};

export function scoreSkinRun(verdicts: readonly CaseVerdict[]): SkinScore {
    const totalStages = verdicts.length;
    if (!totalStages) {
        return {
            score: 0,
            stars: 0,
            stageCorrect: 0,
            treatmentCorrect: 0,
            totalStages: 0,
            totalTreatments: 0,
            perfect: false,
        };
    }

    const stageCorrect = verdicts.filter((item) => item.stageOk).length;
    const treatmentCorrect = verdicts.filter((item) => item.treatmentOk).length;
    const earned = verdicts.reduce((sum, item) => sum + casePoints(item), 0);
    const max = totalStages * CASE_POINTS;
    const score = Math.round((earned / max) * 100);

    const totalParts = totalStages * 2;
    const correctParts = stageCorrect + treatmentCorrect;
    const ratio = correctParts / totalParts;
    const perfect = correctParts === totalParts;

    // 全部 12 项正确 = 3 星；≥80% = 2 星；≥50% = 1 星。
    const stars = starLadder([
        { ok: perfect, stars: 3 },
        { ok: ratio >= 0.8, stars: 2 },
        { ok: ratio >= 0.5, stars: 1 },
    ]);

    return {
        score,
        stars,
        stageCorrect,
        treatmentCorrect,
        totalStages,
        totalTreatments: totalStages,
        perfect,
    };
}

export function scoreCases(verdicts: readonly CaseVerdict[]): CaseScore[] {
    return verdicts.map((item) => ({ ...item, points: casePoints(item) }));
}
