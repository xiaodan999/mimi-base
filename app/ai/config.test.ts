import { beforeEach, describe, expect, test } from "bun:test";

import {
    openCodeRelayBaseUrl,
    readAiSettings,
    writeAiSettings,
} from "./config";
import { AI_SETTINGS_KEY, LEGACY_SETTINGS_KEY } from "./constants";

let store: Map<string, string>;

beforeEach(() => {
    store = new Map<string, string>();
    (globalThis as unknown as { window: unknown }).window = globalThis;
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            store.set(key, String(value));
        },
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
        key: (index: number) => [...store.keys()][index] ?? null,
        get length() {
            return store.size;
        },
    };
});

describe("站点中转地址", () => {
    test("拼接时去掉重复斜杠", () => {
        expect(openCodeRelayBaseUrl("https://mimi.example.com/")).toBe(
            "https://mimi.example.com/ai/opencode/v1",
        );
        expect(openCodeRelayBaseUrl("http://127.0.0.1:3000")).toBe(
            "http://127.0.0.1:3000/ai/opencode/v1",
        );
    });
});

describe("设置读写", () => {
    test("没有设置时返回默认值", () => {
        expect(readAiSettings()).toEqual({
            notify: false,
            dailyBudgetUsd: 0,
        });
    });

    test("旧版本设置里的 Key / 地址 / 模型会被清掉", () => {
        store.set(
            AI_SETTINGS_KEY,
            JSON.stringify({
                baseUrl: "https://api.deepseek.com/v1",
                apiKey: "sk-secret",
                model: "deepseek-chat",
                notify: true,
                dailyBudgetUsd: 5,
            }),
        );

        expect(readAiSettings()).toEqual({
            notify: true,
            dailyBudgetUsd: 5,
        });

        const stored = store.get(AI_SETTINGS_KEY) ?? "";
        expect(stored).not.toContain("sk-secret");
        expect(stored).not.toContain("deepseek");
        expect(JSON.parse(stored)).toEqual({
            notify: true,
            dailyBudgetUsd: 5,
        });
    });

    test("会迁移 legacy 键并清掉旧字段", () => {
        store.set(
            LEGACY_SETTINGS_KEY,
            JSON.stringify({
                apiKey: "sk-legacy",
                baseUrl: "https://api.example.com/v1",
                notify: true,
            }),
        );

        expect(readAiSettings()).toEqual({
            notify: true,
            dailyBudgetUsd: 0,
        });
        expect(store.has(LEGACY_SETTINGS_KEY)).toBe(false);
        expect(store.get(AI_SETTINGS_KEY)).not.toContain("sk-legacy");
    });

    test("写入时归一化预算并删除 legacy 键", () => {
        store.set(LEGACY_SETTINGS_KEY, "{}");
        writeAiSettings({ notify: true, dailyBudgetUsd: -3 });

        expect(JSON.parse(store.get(AI_SETTINGS_KEY)!)).toEqual({
            notify: true,
            dailyBudgetUsd: 0,
        });
        expect(store.has(LEGACY_SETTINGS_KEY)).toBe(false);
    });
});
