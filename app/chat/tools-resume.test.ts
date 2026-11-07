import { describe, expect, test } from "bun:test";

import {
    askUserRequestFromArgs,
    expenseRequestFromArgs,
    isInteractiveTool,
    pendingRequestFromToolCall,
    resolveInteractiveToolResult,
} from "./tools";
import { isTransientCancelReason } from "./user-input";

describe("askUserRequestFromArgs", () => {
    test("builds a valid request", () => {
        expect(
            askUserRequestFromArgs({
                question: " 你在哪个城市？ ",
                kind: "text",
                placeholder: "例如：上海",
            }),
        ).toEqual({
            question: "你在哪个城市？",
            kind: "text",
            placeholder: "例如：上海",
        });
    });

    test("rejects incomplete or invalid args", () => {
        expect(askUserRequestFromArgs({ kind: "text" })).toBeNull();
        expect(
            askUserRequestFromArgs({ question: "x", kind: "voice" }),
        ).toBeNull();
        expect(
            askUserRequestFromArgs({
                question: "x",
                kind: "choice",
                options: ["只给一个"],
            }),
        ).toBeNull();
    });
});

describe("expenseRequestFromArgs", () => {
    test("builds the confirm card request", () => {
        expect(
            expenseRequestFromArgs({
                item: "午饭",
                price: 42.5,
                category: "food",
            }),
        ).toEqual({
            question: "记下这一笔？",
            kind: "expense",
            expense: { item: "午饭", price: 42.5, category: "food" },
        });
    });

    test("rejects bad items and prices", () => {
        expect(expenseRequestFromArgs({ item: "", price: 1 })).toBeNull();
        expect(expenseRequestFromArgs({ item: "x", price: 0 })).toBeNull();
        expect(expenseRequestFromArgs({ item: "x", price: -3 })).toBeNull();
    });
});

describe("pendingRequestFromToolCall", () => {
    test("revives ask_user and log_expense parts", () => {
        expect(
            pendingRequestFromToolCall(
                "ask_user",
                JSON.stringify({
                    question: "可以获取你的位置吗？",
                    kind: "location",
                }),
            ),
        ).toMatchObject({ kind: "location", question: "可以获取你的位置吗？" });
        expect(
            pendingRequestFromToolCall(
                "log_expense",
                JSON.stringify({ item: "奶茶", price: 18 }),
            ),
        ).toMatchObject({ kind: "expense" });
    });

    test("ignores other tools and broken args", () => {
        expect(pendingRequestFromToolCall("sandbox_run", "{}")).toBeNull();
        expect(pendingRequestFromToolCall("ask_user", "not json")).toBeNull();
        expect(pendingRequestFromToolCall("ask_user", "[1]")).toBeNull();
    });
});

describe("resolveInteractiveToolResult", () => {
    test("maps text and location answers", async () => {
        const text = await resolveInteractiveToolResult(
            "ask_user",
            { kind: "text" },
            { ok: true, answer: "上海" },
        );
        expect(text).toEqual({
            result: { ok: true, kind: "text", answer: "上海" },
            isError: false,
        });

        const location = await resolveInteractiveToolResult(
            "ask_user",
            { kind: "location" },
            {
                ok: true,
                location: { latitude: 31.23, longitude: 121.47, accuracy: 0 },
            },
        );
        expect(location.result).toMatchObject({ ok: true, kind: "location" });
    });

    test("maps failures", async () => {
        const cancelled = await resolveInteractiveToolResult(
            "ask_user",
            { kind: "text" },
            { ok: false, error: "用户取消了请求" },
        );
        expect(cancelled).toEqual({
            result: { ok: false, error: "用户取消了请求" },
            isError: true,
        });
    });

    test("log_expense without login fails cleanly", async () => {
        const result = await resolveInteractiveToolResult(
            "log_expense",
            {
                item: "午饭",
                price: 10,
            },
            { ok: true },
        );
        expect(result.isError).toBe(true);
    });
});

describe("isTransientCancelReason", () => {
    test("navigation cancels are transient, explicit ones are not", () => {
        expect(isTransientCancelReason("用户离开了当前页面")).toBe(true);
        expect(isTransientCancelReason("对话已切换")).toBe(true);
        expect(isTransientCancelReason("用户取消了请求")).toBe(false);
        expect(isTransientCancelReason("用户没有确认这笔账")).toBe(false);
    });
});

describe("isInteractiveTool", () => {
    test("only the pausable tools resume", () => {
        expect(isInteractiveTool("ask_user")).toBe(true);
        expect(isInteractiveTool("log_expense")).toBe(true);
        expect(isInteractiveTool("sandbox_run")).toBe(false);
    });
});
