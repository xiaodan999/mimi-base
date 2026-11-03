import { describe, expect, test } from "bun:test";

import type { JiZhangItemData } from "./-data";
import {
    buildTrend,
    sumExpenses,
    summarizeDays,
    type ExpenseDay,
} from "./-summary";

function expense(price: number, itemName = "测试"): JiZhangItemData {
    return {
        id: `${itemName}-${price}`,
        price,
        itemName,
        createdAt: "2026-11-03T10:00:00.000Z",
        category: "",
    };
}

function day(date: string, ...prices: number[]): ExpenseDay {
    return { date, items: prices.map((price) => expense(price, date)) };
}

describe("sumExpenses", () => {
    test("adds prices", () => {
        expect(sumExpenses([expense(12.5), expense(0.5)])).toBe(13);
    });

    test("returns 0 for an empty list", () => {
        expect(sumExpenses([])).toBe(0);
    });
});

describe("summarizeDays", () => {
    test("totals, counts, and averages over the calendar range", () => {
        const days = [day("2026-11-01", 10, 5), day("2026-11-03", 15)];
        const summary = summarizeDays(
            days,
            new Date(2026, 9, 25),
            new Date(2026, 10, 3),
        );

        expect(summary.total).toBe(30);
        expect(summary.count).toBe(3);
        expect(summary.days).toBe(10);
        expect(summary.dailyAverage).toBe(3);
    });

    test("a single day never divides by zero", () => {
        const summary = summarizeDays(
            [day("2026-11-03", 8)],
            new Date(2026, 10, 3),
            new Date(2026, 10, 3),
        );

        expect(summary.days).toBe(1);
        expect(summary.dailyAverage).toBe(8);
    });

    test("empty days average to zero", () => {
        const summary = summarizeDays([], new Date(2026, 10, 1));

        expect(summary.total).toBe(0);
        expect(summary.dailyAverage).toBe(0);
    });
});

describe("buildTrend", () => {
    test("zero-fills every day in a short range, oldest first", () => {
        const trend = buildTrend(
            [day("2026-11-02", 20)],
            new Date(2026, 10, 1),
            new Date(2026, 10, 3),
        );

        expect(trend.map((point) => point.date)).toEqual([
            "2026-11-01",
            "2026-11-02",
            "2026-11-03",
        ]);
        expect(trend.map((point) => point.total)).toEqual([0, 20, 0]);
    });

    test("caps a long range to the last seven days", () => {
        const trend = buildTrend(
            [day("2026-10-01", 99), day("2026-11-03", 5)],
            new Date(2026, 9, 1),
            new Date(2026, 10, 3),
        );

        expect(trend).toHaveLength(7);
        expect(trend[0].date).toBe("2026-10-28");
        expect(trend[trend.length - 1]).toEqual({
            date: "2026-11-03",
            total: 5,
        });
    });

    test("returns nothing without a start date", () => {
        expect(buildTrend([], undefined)).toEqual([]);
    });
});
