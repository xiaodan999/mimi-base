/**
 * 学习进度的纯 reducer（从组件里抽出来，方便 bun test 直接覆盖）。
 * 不依赖 React / PocketBase：组件只负责 `update((p) => reducer(p, ...))`。
 */
import { bumpDaily } from "./engine";
import { applySrs } from "./scheduling";
import type { Progress, QuizItem } from "./types";

/**
 * 记录一道题的作答：
 *  - stat：答对 r+1 / 答错 w+1
 *  - wrong：答错累计次数与时间戳；答对则移除错题
 *  - 每日计数 / 每日任务结算
 *  - SM-2：更新这道题的下次复习时间
 */
export function recordQuizAnswer(
    current: Progress,
    target: QuizItem,
    ok: boolean,
    now = Date.now(),
): Progress {
    const stat = current.stat[target.id] ?? { r: 0, w: 0 };
    const nextStat = ok
        ? { ...stat, r: stat.r + 1 }
        : { ...stat, w: stat.w + 1 };
    const wrong = { ...current.wrong };
    if (ok) {
        delete wrong[target.id];
    } else {
        wrong[target.id] = {
            c: (wrong[target.id]?.c ?? 0) + 1,
            t: now,
        };
    }
    return applySrs(
        bumpDaily(
            {
                ...current,
                stat: { ...current.stat, [target.id]: nextStat },
                wrong,
            },
            { questions: 1, correct: ok ? 1 : 0 },
        ),
        target.id,
        ok,
        now,
    );
}
