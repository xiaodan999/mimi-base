import { describe, expect, test } from "bun:test";

import {
    answerUserInput,
    cancelUserInput,
    cancelUserInputFor,
    getPendingUserInput,
    hasPendingUserInput,
    requestUserInput,
} from "./user-input";

describe("user input store", () => {
    test("resolves when the user answers", async () => {
        const promise = requestUserInput({
            question: "你在哪个城市？",
            kind: "text",
        });
        expect(getPendingUserInput()).toMatchObject({
            question: "你在哪个城市？",
            kind: "text",
        });
        answerUserInput({ ok: true, answer: "上海" });
        await expect(promise).resolves.toEqual({
            ok: true,
            answer: "上海",
        });
        expect(getPendingUserInput()).toBeNull();
    });

    test("cancelling resolves with an error", async () => {
        const promise = requestUserInput({
            question: "确认吗？",
            kind: "confirm",
        });
        cancelUserInput("用户取消了请求");
        await expect(promise).resolves.toEqual({
            ok: false,
            error: "用户取消了请求",
        });
    });

    test("only one request can be pending", async () => {
        const first = requestUserInput({
            question: "第一个",
            kind: "text",
        });
        await expect(
            requestUserInput({ question: "第二个", kind: "text" }),
        ).resolves.toEqual({
            ok: false,
            error: "已经有一个问题在等待回答",
        });
        answerUserInput({ ok: true, answer: "ok" });
        await first;
    });

    test("answering without a pending request is a no-op", () => {
        expect(() => answerUserInput({ ok: true, answer: "x" })).not.toThrow();
        expect(getPendingUserInput()).toBeNull();
    });

    test("a question belongs to its conversation", async () => {
        const promise = requestUserInput({
            question: "继续吗？",
            kind: "confirm",
            conversationId: "conv-a",
        });
        expect(hasPendingUserInput("conv-a")).toBe(true);
        expect(hasPendingUserInput("conv-b")).toBe(false);
        expect(hasPendingUserInput()).toBe(true);

        // Cancelling another conversation must leave this question waiting.
        cancelUserInputFor("conv-b", "别的对话停止了");
        expect(getPendingUserInput()?.question).toBe("继续吗？");

        cancelUserInputFor("conv-a", "用户停止了生成");
        await expect(promise).resolves.toEqual({
            ok: false,
            error: "用户停止了生成",
        });
        expect(hasPendingUserInput("conv-a")).toBe(false);
    });
});
