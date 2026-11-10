import { afterEach, describe, expect, test } from "bun:test";

import {
    appendFeedbackError,
    clearFeedbackErrors,
    type FeedbackErrorEntry,
    formatFeedbackErrorText,
    getFeedbackErrors,
    installFeedbackCapture,
    MAX_ERROR_MESSAGE_CHARS,
    MAX_FEEDBACK_ERRORS,
    pushFeedbackError,
    readLastRoute,
    rememberRoute,
    subscribeFeedbackErrors,
} from "./error-buffer";

function entry(index: number): FeedbackErrorEntry {
    return {
        at: `2026-11-09T10:00:${String(index).padStart(2, "0")}.000Z`,
        kind: "error",
        message: `error-${index}`,
    };
}

afterEach(() => {
    clearFeedbackErrors();
});

describe("appendFeedbackError", () => {
    test("keeps insertion order and caps the buffer", () => {
        let list: FeedbackErrorEntry[] = [];
        for (let index = 0; index < 25; index += 1) {
            list = appendFeedbackError(list, entry(index));
        }
        expect(list).toHaveLength(MAX_FEEDBACK_ERRORS);
        expect(list[0]?.message).toBe("error-5");
        expect(list[list.length - 1]?.message).toBe("error-24");
    });

    test("a zero cap disables capture", () => {
        expect(appendFeedbackError([], entry(1), 0)).toEqual([]);
    });
});

describe("formatFeedbackErrorText", () => {
    test("stringifies errors and values, collapses whitespace", () => {
        expect(formatFeedbackErrorText(new Error("boom\n  here"))).toBe(
            "boom here",
        );
        expect(formatFeedbackErrorText({ code: 1 })).toBe('{"code":1}');
        expect(formatFeedbackErrorText(undefined)).toBe("undefined");
    });

    test("caps a single message", () => {
        expect(formatFeedbackErrorText("x".repeat(2000))).toHaveLength(
            MAX_ERROR_MESSAGE_CHARS,
        );
    });
});

describe("feedback error store", () => {
    test("pushes, notifies and clears", () => {
        let notified = 0;
        const unsubscribe = subscribeFeedbackErrors(() => {
            notified += 1;
        });
        pushFeedbackError({
            at: "2026-11-09T10:00:00.000Z",
            kind: "unhandledrejection",
            message: "failed to fetch",
            source: "app.tsx:1",
        });
        expect(getFeedbackErrors()).toHaveLength(1);
        expect(getFeedbackErrors()[0]).toEqual({
            at: "2026-11-09T10:00:00.000Z",
            kind: "unhandledrejection",
            message: "failed to fetch",
            source: "app.tsx:1",
        });
        expect(notified).toBe(1);

        clearFeedbackErrors();
        expect(getFeedbackErrors()).toEqual([]);
        expect(notified).toBe(2);
        unsubscribe();
    });

    test("install is a no-op outside the browser", () => {
        const cleanup = installFeedbackCapture();
        expect(typeof cleanup).toBe("function");
        cleanup();
    });
});

describe("route memory", () => {
    test("falls back to /home when there is no session storage", () => {
        rememberRoute("/home");
        expect(readLastRoute()).toBe("/home");
    });
});
