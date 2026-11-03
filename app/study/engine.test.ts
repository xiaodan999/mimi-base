import { describe, expect, test } from "bun:test";

import {
    blankOK,
    isAnswerCorrect,
    keywordRatio,
    kwHit,
    norm,
    scoreExam,
} from "./engine";
import type { QuizItem } from "./types";

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
