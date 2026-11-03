/**
 * 《20:00 夜班》的纯计分逻辑。
 * 单独放这里是为了能直接跑 bun test，不依赖 React / three。
 */

import type { ScoreResult } from "../scoring";

export type ShiftScoreInput = {
    /** 结束时剩余的患者安全分 0-100 */
    safety: number;
    /** 成功处理的事件数 */
    resolved: number;
    /** 事件总数，默认 8 */
    total?: number;
    /** 答错的总次数 */
    wrong?: number;
    /** 超时未处理的事件数；缺省按 total - resolved 计算 */
    missed?: number;
    /** 值班结束时剩余的秒数 */
    timeLeft?: number;
    /** 整班总秒数，默认 360 */
    timeTotal?: number;
    /** 患者安全归零导致的提前结束 */
    failed?: boolean;
};

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function shiftScore(input: ShiftScoreInput): ScoreResult {
    const total = Math.max(1, input.total ?? 8);
    const resolved = clamp(input.resolved, 0, total);
    const safety = clamp(input.safety, 0, 100);
    const wrong = Math.max(0, input.wrong ?? 0);
    const missed = Math.max(0, input.missed ?? total - resolved);
    const timeTotal = Math.max(1, input.timeTotal ?? 360);
    const timeRatio = clamp((input.timeLeft ?? 0) / timeTotal, 0, 1);

    // 患者安全归零就是一次患者安全事件，本班判定失败
    if (input.failed || safety <= 0) {
        return { score: 0, stars: 0 };
    }

    const score = Math.round(
        clamp(
            (resolved / total) * 70 +
                (safety / 100) * 30 +
                timeRatio * 10 -
                wrong * 2.5 -
                missed * 3,
            0,
            100,
        ),
    );

    let stars: ScoreResult["stars"] = 0;
    if (resolved >= total) {
        if (wrong === 0 && safety >= 90) stars = 3;
        else if (wrong <= 2 && safety >= 60) stars = 2;
        else stars = 1;
    } else if (resolved >= Math.ceil(total * 0.6) && safety >= 30) {
        stars = 1;
    }

    return { score, stars };
}
