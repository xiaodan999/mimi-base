import { describe, expect, test } from "bun:test";

import {
    blankOK,
    buildExam,
    bumpDaily,
    dayKey,
    EXAM_PRESETS,
    isAnswerCorrect,
    keywordRatio,
    kwHit,
    norm,
    questionStats,
    scoreExam,
    streakDays,
} from "./engine";
import { emptyProgress, type QuizItem, type StudySubject } from "./types";

describe("norm", () => {
    test("drops punctuation, spaces and case", () => {
        expect(norm(" 慢性 阻塞性，肺疾病！ ")).toBe("慢性阻塞性肺疾病");
        expect(norm("COPD")).toBe("copd");
    });

    test("converts full-width numbers and letters", () => {
        expect(norm("１２３ＡＢ")).toBe("123ab");
    });
});

describe("blankOK", () => {
    test("accepts alternatives separated by |", () => {
        expect(blankOK("肺泡", ["肺泡|肺泡"])).toBe(true);
        expect(blankOK("肺脏", ["肺泡|肺脏"])).toBe(true);
    });

    test("accepts equal numbers", () => {
        expect(blankOK("2.0", ["2"])).toBe(true);
        expect(blankOK("2", ["3"])).toBe(false);
    });

    test("rejects empty input", () => {
        expect(blankOK("", ["肺泡"])).toBe(false);
        expect(blankOK("   ", ["肺泡"])).toBe(false);
    });

    test("accepts a normalized match", () => {
        expect(blankOK("答案A。", ["答案a"])).toBe(true);
    });
});

describe("keyword scoring", () => {
    test("kwHit finds every key present in the answer", () => {
        expect(
            kwHit("慢性阻塞性肺疾病以气流受限为特征", ["肺疾病", "气流受限"]),
        ).toEqual(["肺疾病", "气流受限"]);
    });

    test("keywordRatio is the hit fraction", () => {
        expect(keywordRatio("肺疾病", ["肺疾病", "气流受限"])).toBe(0.5);
        expect(keywordRatio("", ["肺疾病"])).toBe(0);
    });
});

describe("isAnswerCorrect", () => {
    const single: QuizItem = {
        id: "s1",
        m: "m1",
        type: "single",
        stem: "题干",
        o: ["A", "B", "C"],
        a: 1,
    };

    const multi: QuizItem = {
        id: "m1",
        m: "m1",
        type: "multi",
        stem: "题干",
        o: ["A", "B", "C"],
        a: [0, 2],
    };

    test("single choice compares the index", () => {
        expect(isAnswerCorrect(single, 1)).toBe(true);
        expect(isAnswerCorrect(single, 0)).toBe(false);
    });

    test("multi choice ignores order and rejects partial answers", () => {
        expect(isAnswerCorrect(multi, [2, 0])).toBe(true);
        expect(isAnswerCorrect(multi, [0])).toBe(false);
        expect(isAnswerCorrect(multi, [0, 1, 2])).toBe(false);
    });
});

describe("scoreExam", () => {
    test("weights each type and reports a rounded percentage", () => {
        const items: QuizItem[] = [
            {
                id: "q1",
                m: "m1",
                type: "single",
                stem: "题干",
                o: ["A", "B"],
                a: 0,
            },
            {
                id: "q2",
                m: "m1",
                type: "multi",
                stem: "题干",
                o: ["A", "B", "C"],
                a: [0, 2],
            },
        ];

        const result = scoreExam(items, [0, [0]]);

        expect(result.raw).toBe(2);
        expect(result.max).toBe(6);
        expect(result.score).toBe(33);
        expect(result.detail).toEqual([true, false]);
        expect(result.byType.single).toEqual({ n: 1, ok: 1 });
        expect(result.byType.multi).toEqual({ n: 1, ok: 0 });
    });
});

describe("buildExam", () => {
    function item(id: string, type: QuizItem["type"]): QuizItem {
        return { id, m: "m1", type, stem: id, o: ["A"], a: 0 } as QuizItem;
    }
    const bank: QuizItem[] = [
        item("s1", "single"),
        item("s2", "single"),
        item("s3", "single"),
        item("m1", "multi"),
        item("m2", "multi"),
        item("t1", "term"),
        item("b1", "blank"),
        item("h1", "short"),
    ];
    const subject = { bank } as StudySubject;

    test("按 counts 取题且不超过库存", () => {
        const items = buildExam(subject, {
            key: "x",
            name: "x",
            minutes: 1,
            desc: "",
            counts: { single: 2, multi: 5 },
        });
        expect(items.length).toBe(4);
        expect(items.filter((i) => i.type === "single").length).toBe(2);
        expect(items.filter((i) => i.type === "multi").length).toBe(2);
    });

    test("真实预设返回的题都来自题库", () => {
        for (const preset of EXAM_PRESETS) {
            const items = buildExam(subject, preset);
            expect(items.every((i) => bank.includes(i))).toBe(true);
        }
    });

    test("空 counts 返回空卷", () => {
        expect(
            buildExam(subject, {
                key: "x",
                name: "x",
                minutes: 0,
                desc: "",
                counts: {},
            }),
        ).toEqual([]);
    });
});

describe("streakDays", () => {
    function dayOffset(n: number): string {
        const date = new Date();
        date.setDate(date.getDate() - n);
        return dayKey(date);
    }

    test("没有任何记录为 0", () => {
        expect(streakDays(emptyProgress())).toBe(0);
    });

    test("今天起连续 3 天", () => {
        const progress = {
            ...emptyProgress(),
            days: [dayOffset(2), dayOffset(1), dayOffset(0)],
        };
        expect(streakDays(progress)).toBe(3);
    });

    test("中间断一天则只算到断点", () => {
        const progress = {
            ...emptyProgress(),
            days: [dayOffset(2), dayOffset(0)],
        };
        expect(streakDays(progress)).toBe(1);
    });

    test("今天没学但昨天/前天学了，从昨天起连续", () => {
        const progress = {
            ...emptyProgress(),
            days: [dayOffset(2), dayOffset(1)],
        };
        expect(streakDays(progress)).toBe(2);
    });
});

describe("每日任务 reducer", () => {
    test("bumpDaily 累加今天并结算三项任务", () => {
        const progress = bumpDaily(emptyProgress(), {
            questions: 10,
            correct: 8,
            cards: 1,
            games: 1,
        });
        expect(progress.daily.date).toBe(dayKey());
        expect(progress.daily.questions).toBe(10);
        expect(progress.daily.correct).toBe(8);
        expect(progress.xp).toBe(30);
        expect(progress.quest.awarded).toBe(1);
    });

    test("同一天只发一次 XP", () => {
        let progress = bumpDaily(emptyProgress(), {
            questions: 10,
            correct: 10,
            cards: 1,
            games: 1,
        });
        progress = bumpDaily(progress, { questions: 1 });
        expect(progress.xp).toBe(30);
    });

    test("未达标不发奖", () => {
        const progress = bumpDaily(emptyProgress(), { questions: 3 });
        expect(progress.xp).toBe(0);
        expect(progress.quest.awarded).toBeUndefined();
    });
});

describe("questionStats", () => {
    test("汇总答题数与正确率", () => {
        const progress = {
            ...emptyProgress(),
            stat: { a: { r: 3, w: 1 }, b: { r: 2, w: 4 } },
        };
        expect(questionStats(progress)).toEqual({
            done: 10,
            right: 5,
            accuracy: 50,
        });
    });

    test("空进度为 0", () => {
        expect(questionStats(emptyProgress())).toEqual({
            done: 0,
            right: 0,
            accuracy: 0,
        });
    });
});
