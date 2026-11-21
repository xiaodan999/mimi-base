import { useCallback, useReducer } from "react";

import type { Answer } from "./types";

export type QuizSessionState = {
    index: number;
    answers: Answer[];
    /** The question is submitted (options locked, feedback visible). */
    done: boolean[];
    /** The answer was graded (AI or self), so short/term can advance. */
    graded: boolean[];
    /** Correctness used by the result screen. */
    result: boolean[];
    finished: boolean;
    /** Keywords the user tapped in the reference answer. */
    revealed: string[];
};

export type QuizSessionAction =
    | { type: "answer"; index: number; value: Answer }
    | { type: "settle"; index: number; ok: boolean }
    | { type: "mark-done"; index: number }
    | { type: "self-grade"; index: number; score: 0 | 0.5 | 1 }
    | { type: "next" }
    | { type: "restart" }
    | { type: "toggle-reveal"; key: string };

export function createQuizSession(count: number): QuizSessionState {
    return {
        index: 0,
        answers: Array.from({ length: count }, () => undefined),
        done: Array.from({ length: count }, () => false),
        graded: Array.from({ length: count }, () => false),
        result: Array.from({ length: count }, () => false),
        finished: false,
        revealed: [],
    };
}

function setAt<T>(list: T[], index: number, value: T): T[] {
    return list.map((entry, current) => (current === index ? value : entry));
}

/** Pure quiz flow: current question, answers, submission and score bookkeeping. */
export function quizSessionReducer(
    state: QuizSessionState,
    action: QuizSessionAction,
): QuizSessionState {
    switch (action.type) {
        case "answer":
            return {
                ...state,
                answers: setAt(state.answers, action.index, action.value),
            };
        case "settle":
            return {
                ...state,
                done: setAt(state.done, action.index, true),
                result: setAt(state.result, action.index, action.ok),
            };
        case "mark-done":
            return {
                ...state,
                done: setAt(state.done, action.index, true),
            };
        case "self-grade":
            return {
                ...state,
                graded: setAt(state.graded, action.index, true),
                result: setAt(state.result, action.index, action.score >= 0.5),
            };
        case "next":
            if (state.index + 1 >= state.answers.length) {
                return { ...state, finished: true };
            }
            return { ...state, index: state.index + 1, revealed: [] };
        case "restart":
            return createQuizSession(state.answers.length);
        case "toggle-reveal":
            return {
                ...state,
                revealed: state.revealed.includes(action.key)
                    ? state.revealed.filter((key) => key !== action.key)
                    : [...state.revealed, action.key],
            };
    }
}

/** QuizRunner's state plus named actions; the reducer itself stays pure. */
export function useQuizSession(count: number) {
    const [state, dispatch] = useReducer(
        quizSessionReducer,
        count,
        createQuizSession,
    );

    const choose = useCallback(
        (index: number, value: Answer) =>
            dispatch({ type: "answer", index, value }),
        [],
    );
    const settle = useCallback(
        (index: number, ok: boolean) => dispatch({ type: "settle", index, ok }),
        [],
    );
    const markDone = useCallback(
        (index: number) => dispatch({ type: "mark-done", index }),
        [],
    );
    const selfGrade = useCallback(
        (index: number, score: 0 | 0.5 | 1) =>
            dispatch({ type: "self-grade", index, score }),
        [],
    );
    const next = useCallback(() => dispatch({ type: "next" }), []);
    const restart = useCallback(() => dispatch({ type: "restart" }), []);
    const toggleReveal = useCallback(
        (key: string) => dispatch({ type: "toggle-reveal", key }),
        [],
    );

    return {
        ...state,
        choose,
        settle,
        markDone,
        selfGrade,
        next,
        restart,
        toggleReveal,
    };
}
