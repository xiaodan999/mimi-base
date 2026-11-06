import { beforeEach, describe, expect, test } from "bun:test";

import type { AiSettings } from "./config";
import {
    estimateCostUsd,
    formatUsd,
    isOverBudget,
    priceFor,
    readDailyUsage,
    recordUsage,
} from "./usage";

const settings: AiSettings = {
    notify: false,
    dailyBudgetUsd: 0,
};

beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as unknown as { window: unknown }).window = globalThis;
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, String(value)),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
        key: (index: number) => [...store.keys()][index] ?? null,
        get length() {
            return store.size;
        },
    };
});

describe("花费估算", () => {
    test("按模型单价估算，未知模型用保守均价", () => {
        expect(priceFor("deepseek-chat").input).toBe(0.28);
        expect(
            estimateCostUsd("deepseek-chat", {
                promptTokens: 1_000_000,
                completionTokens: 0,
                totalTokens: 1_000_000,
            }),
        ).toBeCloseTo(0.28);
        expect(priceFor("mystery-model").input).toBe(1);
    });

    test("formatUsd 处理 0 / 极小值 / 正常值", () => {
        expect(formatUsd(0)).toBe("$0");
        expect(formatUsd(0.001)).toBe("<$0.01");
        expect(formatUsd(0.25)).toBe("$0.25");
    });
});

describe("每日累计与预算", () => {
    test("recordUsage 累加次数、token、花费", () => {
        recordUsage("deepseek-chat", {
            promptTokens: 1000,
            completionTokens: 500,
            totalTokens: 1500,
        });
        recordUsage("deepseek-chat", {
            promptTokens: 1000,
            completionTokens: 500,
            totalTokens: 1500,
        });
        const day = readDailyUsage();
        expect(day.calls).toBe(2);
        expect(day.tokens).toBe(3000);
        expect(day.costUsd).toBeGreaterThan(0);
    });

    test("预算 <= 0 不限制，超过才拦", () => {
        expect(isOverBudget({ ...settings, dailyBudgetUsd: 0 })).toBe(false);
        recordUsage("gpt-4o", {
            promptTokens: 1_000_000,
            completionTokens: 1_000_000,
            totalTokens: 2_000_000,
        });
        expect(isOverBudget({ ...settings, dailyBudgetUsd: 0.001 })).toBe(true);
        expect(isOverBudget({ ...settings, dailyBudgetUsd: 1000 })).toBe(false);
    });
});
