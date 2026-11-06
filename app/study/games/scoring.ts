/**
 * 两套小游戏的纯计分逻辑。
 * 单独放这里是为了能直接跑 bun test，不依赖 React / three。
 */

import { clamp, starLadder } from "../lib";

export type ScoreResult = {
    score: number;
    stars: 0 | 1 | 2 | 3;
};

/* ---------------- 夜巡 ---------------- */

export type WardScoreInput = {
    found: number;
    total: number;
    /** 第一次点选就答对的数量 */
    firstTry: number;
    /** 选错的次数 */
    wrong: number;
    /** 剩余秒数 */
    timeLeft: number;
    /** 计时总长，默认 90 秒 */
    timeTotal?: number;
};

export function wardScore(input: WardScoreInput): ScoreResult {
    const total = Math.max(1, input.total);
    const found = clamp(input.found, 0, total);
    const firstTry = clamp(input.firstTry, 0, found);
    const timeTotal = Math.max(1, input.timeTotal ?? 90);
    const timeRatio = clamp(input.timeLeft / timeTotal, 0, 1);

    const score = Math.round(
        clamp(
            (found / total) * 65 +
                (firstTry / total) * 25 +
                timeRatio * 10 -
                input.wrong * 4,
            0,
            100,
        ),
    );

    const stars = starLadder([
        {
            ok: found >= total && input.wrong === 0 && firstTry === total,
            stars: 3,
        },
        { ok: found >= total && input.wrong <= 2, stars: 2 },
        { ok: found >= total, stars: 1 },
        { ok: found >= Math.ceil(total * 0.6), stars: 1 },
    ]);

    return { score, stars };
}

/* ---------------- 输血密室 ---------------- */

export type BloodScoreInput = {
    /** 失误（near miss）次数，3 次判定为患者安全事件 */
    nearMiss: number;
    /** 用时秒数 */
    seconds: number;
    /** 关卡总数，默认 7 */
    total?: number;
    /** 实际通关数 */
    cleared?: number;
};

export function bloodScore(input: BloodScoreInput): ScoreResult {
    if (input.nearMiss >= 3) return { score: 0, stars: 0 };

    const total = Math.max(1, input.total ?? 7);
    const cleared = clamp(input.cleared ?? total, 0, total);
    if (cleared < total) {
        return {
            score: Math.round(
                clamp((cleared / total) * 70 - input.nearMiss * 10, 0, 100),
            ),
            stars: 0,
        };
    }

    // 5 分钟以内不扣分，之后每分钟扣 6 分，最低 40 分
    const overtime = Math.max(0, input.seconds - 300);
    const score = Math.round(
        clamp(100 - input.nearMiss * 18 - overtime * 0.1, 40, 100),
    );
    const stars = starLadder([
        { ok: input.nearMiss === 0, stars: 3 },
        { ok: input.nearMiss === 1, stars: 2 },
        { ok: true, stars: 1 },
    ]);
    return { score, stars };
}
