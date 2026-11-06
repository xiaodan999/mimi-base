import { describe, expect, test } from "bun:test";

import { clamp, starLadder, starText } from "./lib";
import { mergeProgress, normalizeProgress } from "./merge";
import { recordQuizAnswer } from "./progress-reducers";
import {
    applySrs,
    dueCount,
    dueQueue,
    gradeFor,
    scheduleSrs,
} from "./scheduling";
import { emptyProgress, type QuizItem } from "./types";

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

function item(id: string): QuizItem {
    return {
        id,
        m: "m1",
        type: "single",
        stem: id,
        o: ["A"],
        a: 0,
    } as QuizItem;
}

describe("lib：共享小工具", () => {
    test("clamp 夹到区间", () => {
        expect(clamp(5, 0, 10)).toBe(5);
        expect(clamp(-1, 0, 10)).toBe(0);
        expect(clamp(11, 0, 10)).toBe(10);
    });

    test("starLadder 取第一个命中的条件", () => {
        expect(
            starLadder([
                { ok: false, stars: 3 },
                { ok: true, stars: 2 },
                { ok: true, stars: 1 },
            ]),
        ).toBe(2);
        expect(starLadder([{ ok: false, stars: 3 }])).toBe(0);
        expect(starLadder([{ ok: true, stars: 3 }])).toBe(3);
    });

    test("starText 实心/空心星", () => {
        expect(starText(0)).toBe("☆☆☆");
        expect(starText(2)).toBe("★★☆");
        expect(starText(9)).toBe("★★★");
    });
});

describe("mergeProgress：并发合并写入", () => {
    test("只增不减的量取并集 / 较大值", () => {
        const server = normalizeProgress({
            xp: 10,
            stat: { a: { r: 2, w: 1 } },
            days: ["2026-1-1"],
            badges: ["b1"],
        });
        const local = normalizeProgress({
            xp: 5,
            stat: { a: { r: 1, w: 3 }, b: { r: 1, w: 0 } },
            days: ["2026-1-2"],
            badges: ["b2"],
        });
        const merged = mergeProgress(server, local);
        expect(merged.xp).toBe(10);
        expect(merged.stat.a).toEqual({ r: 2, w: 3 });
        expect(merged.stat.b).toEqual({ r: 1, w: 0 });
        expect(merged.days).toEqual(["2026-1-1", "2026-1-2"]);
        expect(merged.badges).toEqual(["b1", "b2"]);
    });

    test("错题本：答对留下的墓碑让删除生效，不会被服务端旧数据复活", () => {
        const server = normalizeProgress({
            wrong: { q1: { c: 2, t: NOW - 1000 } },
        });
        const local = normalizeProgress({
            wrong: {},
            wrongDeleted: { q1: NOW },
        });
        const merged = mergeProgress(server, local);
        expect(merged.wrong).toEqual({});
        expect(merged.wrongDeleted.q1).toBe(NOW);
    });

    test("错题本：服务端独有的条目要保留（另一台设备刚答错）", () => {
        const server = normalizeProgress({
            wrong: {
                q1: { c: 1, t: NOW - 2000 },
                q2: { c: 1, t: NOW - 1000 },
            },
        });
        const local = normalizeProgress({
            wrong: { q1: { c: 2, t: NOW } },
        });
        const merged = mergeProgress(server, local);
        expect(merged.wrong.q1).toEqual({ c: 2, t: NOW });
        expect(merged.wrong.q2).toEqual({ c: 1, t: NOW - 1000 });
    });

    test("错题本：删除之后又答错了，墓碑不生效", () => {
        const server = normalizeProgress({
            wrong: {},
            wrongDeleted: { q1: NOW - 1000 },
        });
        const local = normalizeProgress({
            wrong: { q1: { c: 1, t: NOW } },
        });
        expect(mergeProgress(server, local).wrong.q1).toEqual({
            c: 1,
            t: NOW,
        });
    });

    test("考试记录按 name:date:ts 去重", () => {
        const exam = {
            name: "标准卷",
            score: 80,
            date: "2026-1-1",
            ts: 100,
        };
        const server = normalizeProgress({ exams: [exam] });
        const local = normalizeProgress({
            exams: [exam, { ...exam, ts: 200 }],
        });
        expect(mergeProgress(server, local).exams).toHaveLength(2);
    });

    test("normalizeProgress 补齐旧记录缺失字段", () => {
        const old = normalizeProgress({ xp: 7 } as never);
        expect(old.srs).toEqual({});
        expect(old.cards).toEqual({});
        expect(old.daily.date).toBe("");
        expect(old.xp).toBe(7);
    });

    test("srs 保留服务端独有记录，本地排程优先", () => {
        const server = normalizeProgress({
            srs: {
                q1: {
                    due: NOW + DAY,
                    interval: 1,
                    ease: 2.5,
                    reps: 1,
                    lapses: 0,
                },
                q2: {
                    due: NOW + DAY,
                    interval: 1,
                    ease: 2.5,
                    reps: 1,
                    lapses: 0,
                },
            },
        });
        const local = normalizeProgress({
            srs: {
                q1: {
                    due: NOW + 3 * DAY,
                    interval: 3,
                    ease: 2.5,
                    reps: 2,
                    lapses: 0,
                },
            },
        });
        const merged = mergeProgress(server, local);
        expect(merged.srs.q1.interval).toBe(3);
        expect(merged.srs.q2).toBeDefined();
    });

    test("srs 答错（due 提前）也必须落库", () => {
        const server = normalizeProgress({
            srs: {
                q1: {
                    due: NOW + 6 * DAY,
                    interval: 6,
                    ease: 2.5,
                    reps: 2,
                    lapses: 0,
                },
            },
        });
        // 复习时忘了：due 变成 10 分钟后，lapses +1
        const local = normalizeProgress({
            srs: {
                q1: {
                    due: NOW + 10 * 60_000,
                    interval: 0.007,
                    ease: 1.7,
                    reps: 0,
                    lapses: 1,
                },
            },
        });
        const merged = mergeProgress(server, local);
        expect(merged.srs.q1.due).toBe(NOW + 10 * 60_000);
        expect(merged.srs.q1.lapses).toBe(1);
    });
});

describe("SM-2 排程", () => {
    test("gradeFor 把对错映射成 5 / 2", () => {
        expect(gradeFor(true)).toBe(5);
        expect(gradeFor(false)).toBe(2);
    });

    test("第一次答对：1 天后复习", () => {
        const s = scheduleSrs(undefined, 5, NOW);
        expect(s.reps).toBe(1);
        expect(s.interval).toBe(1);
        expect(s.due).toBe(NOW + DAY);
    });

    test("第二次答对：6 天", () => {
        const first = scheduleSrs(undefined, 5, NOW);
        const second = scheduleSrs(first, 5, NOW);
        expect(second.reps).toBe(2);
        expect(second.interval).toBe(6);
    });

    test("答错：10 分钟内重来、reps 归零、lapses+1", () => {
        const first = scheduleSrs(undefined, 5, NOW);
        const failed = scheduleSrs(first, 2, NOW);
        expect(failed.reps).toBe(0);
        expect(failed.lapses).toBe(1);
        expect(failed.due - NOW).toBeGreaterThan(0);
        expect(failed.due - NOW).toBeLessThan(DAY);
    });

    test("ease 下限 1.3", () => {
        let s = scheduleSrs(undefined, 0, NOW);
        for (let i = 0; i < 12; i++) s = scheduleSrs(s, 0, NOW);
        expect(s.ease).toBeGreaterThanOrEqual(1.3);
    });

    test("applySrs 把排程写进 progress.srs", () => {
        const next = applySrs(emptyProgress(), "q1", true, NOW);
        expect(next.srs.q1.reps).toBe(1);
    });
});

describe("dueQueue：按到期时间排队", () => {
    const bank = [item("q1"), item("q2"), item("q3"), item("q4")];
    const srs = {
        q1: { due: NOW - 1000, interval: 1, ease: 2.5, reps: 1, lapses: 0 },
        q2: { due: NOW - 100, interval: 1, ease: 2.5, reps: 1, lapses: 0 },
        q4: {
            due: NOW + 10 * DAY,
            interval: 10,
            ease: 2.5,
            reps: 3,
            lapses: 0,
        },
    };

    test("未排程的新题全部算待复习", () => {
        expect(dueCount(bank, undefined, NOW)).toBe(4);
    });

    test("到期 + 新题，未到期不算", () => {
        expect(dueCount(bank, srs, NOW)).toBe(3);
    });

    test("逾期早的在前，新题排最后，未到期的排除", () => {
        expect(dueQueue(bank, srs, NOW).map((i) => i.id)).toEqual([
            "q1",
            "q2",
            "q3",
        ]);
    });

    test("limit 生效", () => {
        expect(dueQueue(bank, srs, NOW, 2)).toHaveLength(2);
    });
});

describe("recordQuizAnswer（QuizRunner 的纯 reducer）", () => {
    const q = item("q1");

    test("答对：r+1、移除错题并留墓碑、写 srs、计入每日", () => {
        let progress = normalizeProgress({
            wrong: { q1: { c: 2, t: 1 } },
        });
        progress = recordQuizAnswer(progress, q, true, NOW);
        expect(progress.stat.q1).toEqual({ r: 1, w: 0 });
        expect(progress.wrong.q1).toBeUndefined();
        expect(progress.wrongDeleted.q1).toBe(NOW);
        expect(progress.srs.q1).toBeDefined();
        expect(progress.daily.questions).toBe(1);
        expect(progress.daily.correct).toBe(1);
    });

    test("半对按 3 分排程：间隔比满分短，但不是遗忘重来", () => {
        const base = normalizeProgress({
            srs: {
                q1: {
                    due: NOW,
                    interval: 6,
                    ease: 2.5,
                    reps: 2,
                    lapses: 0,
                },
            },
        });
        const half = recordQuizAnswer(base, q, true, NOW, 3);
        const full = recordQuizAnswer(base, q, true, NOW);
        expect(half.srs.q1.lapses).toBe(0);
        expect(half.srs.q1.reps).toBe(3);
        expect(half.srs.q1.interval).toBeLessThan(full.srs.q1.interval);
    });

    test("答错：w+1、累计错题、srs 短期重来", () => {
        const progress = recordQuizAnswer(emptyProgress(), q, false, NOW);
        expect(progress.stat.q1).toEqual({ r: 0, w: 1 });
        expect(progress.wrong.q1.c).toBe(1);
        expect(progress.wrong.q1.t).toBe(NOW);
        expect(progress.srs.q1.reps).toBe(0);
        expect(progress.srs.q1.lapses).toBe(1);
    });

    test("连续两次答对拉长间隔", () => {
        let progress = emptyProgress();
        progress = recordQuizAnswer(progress, q, true, NOW);
        progress = recordQuizAnswer(progress, q, true, NOW);
        expect(progress.stat.q1.r).toBe(2);
        expect(progress.srs.q1.reps).toBe(2);
        expect(progress.srs.q1.interval).toBe(6);
    });
});
