import { describe, expect, test } from "bun:test";

import {
    restoreAiFeature,
    shouldAutoStart,
    toAiFeatureSnapshot,
} from "./feature-restore";

describe("toAiFeatureSnapshot", () => {
    test("ready keeps the value", () => {
        expect(
            toAiFeatureSnapshot({
                kind: "ready",
                value: "hello",
                source: "cache",
            }),
        ).toEqual({ phase: "ready", value: "hello", error: "" });
    });

    test("running has no value and no error", () => {
        expect(toAiFeatureSnapshot({ kind: "running" })).toEqual({
            phase: "running",
            value: null,
            error: "",
        });
    });

    test("error keeps the task message", () => {
        expect(
            toAiFeatureSnapshot({ kind: "error", message: "网络不好" }),
        ).toEqual({ phase: "error", value: null, error: "网络不好" });
    });

    test("canceled is presented as 已取消", () => {
        expect(toAiFeatureSnapshot({ kind: "canceled" })).toEqual({
            phase: "canceled",
            value: null,
            error: "已取消",
        });
    });

    test("none is idle", () => {
        expect(toAiFeatureSnapshot({ kind: "none" })).toEqual({
            phase: "idle",
            value: null,
            error: "",
        });
    });
});

describe("restoreAiFeature", () => {
    test("running wins over a cached value", () => {
        expect(
            restoreAiFeature({
                task: { status: "running" },
                cached: "old",
            }),
        ).toEqual({ phase: "running", value: null, error: "" });
    });

    test("a good cache outranks a failed rerun", () => {
        expect(
            restoreAiFeature({
                task: { status: "error", error: "失败了" },
                cached: "old",
                hasValue: (value) => value.length > 0,
            }),
        ).toEqual({ phase: "ready", value: "old", error: "" });
    });

    test("empty values fall through to the error", () => {
        expect(
            restoreAiFeature({
                task: { status: "error", error: "失败了" },
                cached: "",
                hasValue: (value) => value.length > 0,
            }),
        ).toEqual({ phase: "error", value: null, error: "失败了" });
    });
});

describe("shouldAutoStart", () => {
    test("only running and idle start a request", () => {
        expect(shouldAutoStart("running")).toBe(true);
        expect(shouldAutoStart("idle")).toBe(true);
        expect(shouldAutoStart("ready")).toBe(false);
        expect(shouldAutoStart("error")).toBe(false);
        expect(shouldAutoStart("canceled")).toBe(false);
    });
});
