import { describe, expect, test } from "bun:test";

import { createQuizSession, quizSessionReducer } from "./use-quiz-session";

describe("createQuizSession", () => {
    test("starts on the first question with empty slots", () => {
        expect(createQuizSession(3)).toEqual({
            index: 0,
            answers: [undefined, undefined, undefined],
            done: [false, false, false],
            graded: [false, false, false],
            result: [false, false, false],
            finished: false,
            revealed: [],
        });
    });
});

describe("quizSessionReducer", () => {
    test("answers are stored per index", () => {
        const state = quizSessionReducer(createQuizSession(2), {
            type: "answer",
            index: 1,
            value: [0, 2],
        });
        expect(state.answers).toEqual([undefined, [0, 2]]);
    });

    test("settle marks done and correctness without touching other rows", () => {
        const state = quizSessionReducer(createQuizSession(2), {
            type: "settle",
            index: 0,
            ok: true,
        });
        expect(state.done).toEqual([true, false]);
        expect(state.result).toEqual([true, false]);
    });

    test("mark-done submits a short answer without grading it", () => {
        const state = quizSessionReducer(createQuizSession(1), {
            type: "mark-done",
            index: 0,
        });
        expect(state.done).toEqual([true]);
        expect(state.result).toEqual([false]);
    });

    test("self-grade counts half as correct and records graded", () => {
        const half = quizSessionReducer(createQuizSession(1), {
            type: "self-grade",
            index: 0,
            score: 0.5,
        });
        expect(half.graded).toEqual([true]);
        expect(half.result).toEqual([true]);
        const miss = quizSessionReducer(half, {
            type: "self-grade",
            index: 0,
            score: 0,
        });
        expect(miss.result).toEqual([false]);
    });

    test("next advances and clears revealed keywords", () => {
        const revealed = quizSessionReducer(createQuizSession(2), {
            type: "toggle-reveal",
            key: "血压",
        });
        const state = quizSessionReducer(revealed, { type: "next" });
        expect(state.index).toBe(1);
        expect(state.revealed).toEqual([]);
        expect(state.finished).toBe(false);
    });

    test("next on the last question finishes", () => {
        const onLast = {
            ...createQuizSession(2),
            index: 1,
        };
        expect(quizSessionReducer(onLast, { type: "next" }).finished).toBe(
            true,
        );
    });

    test("toggle-reveal flips one keyword", () => {
        const on = quizSessionReducer(createQuizSession(1), {
            type: "toggle-reveal",
            key: "a",
        });
        expect(on.revealed).toEqual(["a"]);
        const off = quizSessionReducer(on, {
            type: "toggle-reveal",
            key: "a",
        });
        expect(off.revealed).toEqual([]);
    });

    test("restart recreates the session at the same length", () => {
        const dirty = {
            ...createQuizSession(2),
            index: 1,
            finished: true,
            result: [true, false],
        };
        expect(quizSessionReducer(dirty, { type: "restart" })).toEqual(
            createQuizSession(2),
        );
    });
});
