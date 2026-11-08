import { describe, expect, test } from "bun:test";

import { buildDailyLine } from "./daily-line-text";

describe("buildDailyLine", () => {
    test("今天、本月和连续学习都有时拼成一句", () => {
        expect(
            buildDailyLine({
                postsToday: 2,
                monthSpend: 517.58,
                monthEntries: 23,
                streak: 7,
            }),
        ).toBe("今天发了2条动态，本月花了¥517.58，共23笔，连续学习7天。");
    });

    test("今天没发动态也会如实说", () => {
        expect(
            buildDailyLine({
                postsToday: 0,
                monthSpend: 517.58,
                monthEntries: 23,
                streak: 0,
            }),
        ).toBe("今天还没发动态，本月花了¥517.58，共23笔。");
    });

    test("没有账目时不提本月花费", () => {
        expect(
            buildDailyLine({
                postsToday: 1,
                monthSpend: 0,
                monthEntries: 0,
                streak: 3,
            }),
        ).toBe("今天发了1条动态，连续学习3天。");
    });

    test("什么都没记录时给一句提醒", () => {
        expect(
            buildDailyLine({
                postsToday: 0,
                monthSpend: 0,
                monthEntries: 0,
                streak: 0,
            }),
        ).toBe("今天还没记下什么，随手记一笔吧。");
    });

    test("数字太长时保留今天和本月，丢掉连续学习", () => {
        expect(
            buildDailyLine({
                postsToday: 12,
                monthSpend: 1234567.89,
                monthEntries: 12345,
                streak: 365,
            }),
        ).toBe("今天发了12条动态，本月花了¥1,234,567.89，共12345笔。");
    });

    test("整笔金额不显示小数", () => {
        expect(
            buildDailyLine({
                postsToday: 0,
                monthSpend: 100,
                monthEntries: 2,
                streak: 0,
            }),
        ).toBe("今天还没发动态，本月花了¥100，共2笔。");
    });
});
