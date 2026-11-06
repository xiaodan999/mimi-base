/**
 * 《除颤时刻》的纯计分逻辑。
 * 不依赖 React / three，方便直接跑 bun test。
 */

import { clamp, starLadder } from "../../lib";
import type { ScoreResult } from "../scoring";

/* ---------------- CPR 节律 ---------------- */

export const CPR_BPM = 110;
export const CPR_DURATION_MS = 30_000;
/** 偏差在 ±90ms 内算完美，±200ms 内算良好 */
export const BEAT_PERFECT_MS = 90;
export const BEAT_GOOD_MS = 200;

export type BeatGrade = "perfect" | "good" | "miss";

export type RhythmResult = {
    /** 30 秒内应完成的按压次数 */
    beats: number;
    perfect: number;
    good: number;
    /** 没有对上的预定节拍 */
    miss: number;
    /** 落在所有节拍窗口之外的多余按压 */
    extra: number;
    hits: number;
    /** (perfect + good) / (beats + extra)，0–1 */
    accuracy: number;
    /** 完美 = 1 分、良好 = 0.6 分，用于总分 */
    quality: number;
    /** quality 的百分制 */
    score: number;
};

export type RhythmOptions = {
    durationMs?: number;
    bpm?: number;
};

export function rhythmBeatInterval(bpm = CPR_BPM): number {
    return 60_000 / Math.max(1, bpm);
}

export function rhythmBeatCount(
    durationMs = CPR_DURATION_MS,
    bpm = CPR_BPM,
): number {
    const safeDuration = Math.max(0, durationMs);
    const safeBpm = Math.max(1, bpm);
    // 30 秒 × 110 次/分 = 55 拍；加一个极小值抵消浮点误差
    return Math.floor((safeDuration * safeBpm) / 60_000 + 1e-9);
}

export function gradeBeatDelta(deltaMs: number): BeatGrade {
    const error = Math.abs(deltaMs);
    if (error <= BEAT_PERFECT_MS) return "perfect";
    if (error <= BEAT_GOOD_MS) return "good";
    return "miss";
}

/**
 * 把一串相对时间（毫秒）映射到 110 次/分的节拍上。
 * 每次按压只认领一个最近的节拍；没被认领的节拍记 miss，
 * 落在所有窗口之外的按压记 extra。
 */
export function scoreRhythm(
    taps: readonly number[],
    options: RhythmOptions = {},
): RhythmResult {
    const durationMs = Math.max(1, options.durationMs ?? CPR_DURATION_MS);
    const bpm = Math.max(1, options.bpm ?? CPR_BPM);
    const interval = rhythmBeatInterval(bpm);
    const beats = rhythmBeatCount(durationMs, bpm);
    const used = new Array<boolean>(Math.max(0, beats)).fill(false);
    const sorted = taps
        .filter((tap) => Number.isFinite(tap) && tap >= 0)
        .slice()
        .sort((a, b) => a - b);

    let perfect = 0;
    let good = 0;
    let extra = 0;

    for (const tap of sorted) {
        const center = Math.round(tap / interval);
        let matched = -1;
        let matchedDelta = Number.POSITIVE_INFINITY;

        for (let offset = -1; offset <= 1; offset++) {
            const index = center + offset;
            if (index < 0 || index >= beats || used[index]) continue;
            const delta = Math.abs(tap - index * interval);
            if (delta <= BEAT_GOOD_MS && delta < matchedDelta) {
                matched = index;
                matchedDelta = delta;
            }
        }

        if (matched < 0) {
            extra += 1;
            continue;
        }

        used[matched] = true;
        if (matchedDelta <= BEAT_PERFECT_MS) perfect += 1;
        else good += 1;
    }

    const hits = perfect + good;
    const miss = Math.max(0, beats - hits);
    const attempts = beats + extra;
    const accuracy = attempts > 0 ? hits / attempts : 0;
    const quality = attempts > 0 ? (perfect + good * 0.6) / attempts : 0;

    return {
        beats,
        perfect,
        good,
        miss,
        extra,
        hits,
        accuracy,
        quality,
        score: Math.round(clamp(quality * 100, 0, 100)),
    };
}

/* ---------------- 整局结算 ---------------- */

export const DEFIB_LEADS_TOTAL = 5;
export const DEFIB_PADS_TOTAL = 2;
/** 5 条导联 + 2 片电极 + 节律 + 除颤顺序 */
export const DEFIB_CLEAN_TOTAL = 9;

export type DefibScoreInput = {
    /** 一次就贴对的导联数 */
    leadsClean: number;
    /** 一次就贴对的电极数 */
    padsClean: number;
    /** 命中节拍的比例，0–1 */
    rhythmAccuracy: number;
    /** 按完美/良好加权的节拍质量，0–1；缺省用 rhythmAccuracy */
    rhythmQuality?: number;
    sequenceMistakes: number;
    sequenceCompleted: boolean;
    completed: boolean;
};

export type DefibScoreResult = ScoreResult & {
    placementRatio: number;
    rhythmQuality: number;
    sequenceRatio: number;
};

export function defibScore(input: DefibScoreInput): DefibScoreResult {
    const placementTotal = DEFIB_LEADS_TOTAL + DEFIB_PADS_TOTAL;
    const placementRatio = clamp(
        (input.leadsClean + input.padsClean) / placementTotal,
        0,
        1,
    );
    const rhythmQuality = clamp(
        input.rhythmQuality ?? input.rhythmAccuracy,
        0,
        1,
    );
    const sequenceRatio = input.sequenceCompleted
        ? clamp(1 - Math.max(0, input.sequenceMistakes) * 0.34, 0, 1)
        : 0;

    const score = Math.round(
        clamp(
            placementRatio * 50 + rhythmQuality * 35 + sequenceRatio * 15,
            0,
            100,
        ),
    );

    const accuracy = clamp(input.rhythmAccuracy, 0, 1);
    const stars = starLadder([
        {
            ok:
                input.completed &&
                placementRatio >= 0.999 &&
                sequenceRatio >= 0.999 &&
                input.sequenceCompleted &&
                accuracy >= 0.85,
            stars: 3,
        },
        {
            ok:
                input.completed &&
                placementRatio >= 0.6 &&
                accuracy >= 0.6 &&
                input.sequenceCompleted &&
                input.sequenceMistakes <= 1,
            stars: 2,
        },
        { ok: input.completed, stars: 1 },
    ]);

    return { score, stars, placementRatio, rhythmQuality, sequenceRatio };
}
