/**
 * 间隔重复（SM-2 简化版）排程：纯函数，可直接单测，不依赖 React / PocketBase。
 *
 * 排程状态存在 progress.srs[题目 id]，随进度同步到服务端；QuizRunner 每次作答
 * 调 applySrs 更新，QuizSection 用 dueQueue 挑出「今天该复习」的题组成练习。
 */
import type { Progress, QuizItem, SrsItem } from "./types";

const DAY_MS = 86_400_000;
/** 遗忘后 10 分钟重来（以天为单位） */
const RELEARN_DAYS = 10 / 1440;
const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;

/** 把「答对 / 答错」映射成 SM-2 的 0–5 评分。 */
export function gradeFor(ok: boolean): number {
    return ok ? 5 : 2;
}

/**
 * SM-2 主算法：给定上一状态与本次评分(0–5)，算出下一次的 due / interval / ease。
 * grade < 3 视为遗忘：重置连续答对次数、缩短间隔、累计 lapses。
 */
export function scheduleSrs(
    prev: SrsItem | undefined,
    grade: number,
    now = Date.now(),
): SrsItem {
    const g = Math.max(0, Math.min(5, grade));
    const ease = Math.max(
        MIN_EASE,
        (prev?.ease ?? DEFAULT_EASE) +
            (0.1 - (5 - g) * (0.08 + (5 - g) * 0.02)),
    );
    let reps = prev?.reps ?? 0;
    let lapses = prev?.lapses ?? 0;
    let interval: number; // 天
    if (g < 3) {
        reps = 0;
        lapses += 1;
        interval = RELEARN_DAYS;
    } else if (reps === 0) {
        reps = 1;
        interval = 1;
    } else if (reps === 1) {
        reps = 2;
        interval = 6;
    } else {
        reps += 1;
        interval = Math.max(1, Math.round((prev?.interval ?? 6) * ease));
    }
    return {
        due: now + Math.max(interval, RELEARN_DAYS) * DAY_MS,
        interval,
        ease,
        reps,
        lapses,
    };
}

/**
 * 纯 reducer：把一次作答写进 progress.srs。
 * `grade` 允许半对（自评 0.5 分）用 3 分排程，而不是按满分 5 分。
 */
export function applySrs(
    progress: Progress,
    itemId: string,
    ok: boolean,
    now = Date.now(),
    grade = gradeFor(ok),
): Progress {
    const next = scheduleSrs(progress.srs?.[itemId], grade, now);
    return {
        ...progress,
        srs: { ...(progress.srs ?? {}), [itemId]: next },
    };
}

function isDue(
    item: QuizItem,
    srs: Record<string, SrsItem>,
    now: number,
): boolean {
    const rec = srs[item.id];
    return !rec || rec.due <= now;
}

/** 今天到期的题数（含从未做过的新题）。 */
export function dueCount(
    bank: readonly QuizItem[],
    srs: Record<string, SrsItem> | undefined,
    now = Date.now(),
): number {
    const table = srs ?? {};
    return bank.filter((item) => isDue(item, table, now)).length;
}

/**
 * 复习队列：到期的题按 due 升序（越早逾期越靠前），从未排程的新题排最后，
 * 最多取 limit 道。用「到期时间」而不是 shuffle() 决定复习顺序。
 */
export function dueQueue(
    bank: readonly QuizItem[],
    srs: Record<string, SrsItem> | undefined,
    now = Date.now(),
    limit = 20,
): QuizItem[] {
    const table = srs ?? {};
    const due = bank.filter((item) => isDue(item, table, now));
    due.sort(
        (a, b) =>
            (table[a.id]?.due ?? Number.POSITIVE_INFINITY) -
            (table[b.id]?.due ?? Number.POSITIVE_INFINITY),
    );
    return due.slice(0, Math.max(0, limit));
}
