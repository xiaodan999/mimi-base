import { describe, expect, test } from "bun:test";

import { decideAiRestore } from "./restore";

describe("decideAiRestore", () => {
    test("a running task wins over every stored value", () => {
        expect(
            decideAiRestore({
                task: { status: "running" },
                local: ["local"],
                result: ["result"],
                cached: ["cache"],
            }),
        ).toEqual({ kind: "running" });
    });

    test("prefers local state, then in-memory result, then the cache", () => {
        expect(
            decideAiRestore({
                task: { status: "done" },
                local: ["local"],
                result: ["result"],
                cached: ["cache"],
            }),
        ).toEqual({ kind: "ready", value: ["local"], source: "local" });

        expect(
            decideAiRestore({
                task: { status: "done" },
                result: ["result"],
                cached: ["cache"],
            }),
        ).toEqual({ kind: "ready", value: ["result"], source: "result" });

        expect(
            decideAiRestore({
                task: { status: "done" },
                cached: ["cache"],
            }),
        ).toEqual({ kind: "ready", value: ["cache"], source: "cache" });
    });

    test("an empty value counts as nothing to restore", () => {
        const hasValue = (value: string[]) => value.length > 0;
        expect(
            decideAiRestore({
                task: { status: "done" },
                local: [],
                result: [],
                cached: ["cache"],
                hasValue,
            }),
        ).toEqual({ kind: "ready", value: ["cache"], source: "cache" });
        expect(
            decideAiRestore({
                task: { status: "done" },
                local: [],
                hasValue,
            }),
        ).toEqual({ kind: "none" });
    });

    test("shows a background failure when there is no result to show", () => {
        expect(
            decideAiRestore({
                task: { status: "error", error: "API Key 不对" },
            }),
        ).toEqual({ kind: "error", message: "API Key 不对" });
    });

    test("falls back to a friendly message for an empty error", () => {
        expect(decideAiRestore({ task: { status: "error" } })).toEqual({
            kind: "error",
            message: "AI 请求失败",
        });
    });

    test("reports a canceled task only when nothing is stored", () => {
        expect(decideAiRestore({ task: { status: "canceled" } })).toEqual({
            kind: "canceled",
        });
    });

    test("keeps showing a stored value even if a later run failed", () => {
        // The feature cleared its local state before retrying; the last good
        // result is still better than an empty panel.
        expect(
            decideAiRestore({
                task: { status: "error", error: "超时" },
                cached: ["cache"],
            }),
        ).toEqual({ kind: "ready", value: ["cache"], source: "cache" });
    });

    test("a finished task without result or cache decides nothing", () => {
        expect(decideAiRestore({ task: { status: "done" } })).toEqual({
            kind: "none",
        });
        expect(decideAiRestore({})).toEqual({ kind: "none" });
    });

    test("an interrupted (restored) task never blocks a panel from re-running", () => {
        // 恢复出来的「被中断」行对面板是透明的：有缓存就显示缓存，
        // 没有就落到 none，让面板按原有逻辑重新发起。
        expect(
            decideAiRestore({
                task: { status: "interrupted" },
                local: ["local"],
            }),
        ).toEqual({ kind: "ready", value: ["local"], source: "local" });
        expect(decideAiRestore({ task: { status: "interrupted" } })).toEqual({
            kind: "none",
        });
    });
});
