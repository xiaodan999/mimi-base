import { describe, expect, test } from "bun:test";

import { MAX_CHART_POINTS, normalizeChartSpec } from "./chart";

describe("normalizeChartSpec", () => {
    test("accepts a valid bar spec and rounds values", () => {
        expect(
            normalizeChartSpec({
                type: "bar",
                title: " 本月支出 ",
                labels: ["食", "行"],
                values: [100.111, 50],
                unit: "元",
            }),
        ).toEqual({
            type: "bar",
            title: "本月支出",
            labels: ["食", "行"],
            values: [100.11, 50],
            unit: "元",
        });
    });

    test("rejects malformed payloads", () => {
        for (const bad of [
            null,
            "chart",
            { type: "scatter", title: "x", labels: ["a"], values: [1] },
            { type: "bar", title: "", labels: ["a"], values: [1] },
            { type: "bar", title: "x", labels: ["a"], values: [1, 2] },
            { type: "pie", title: "x", labels: [], values: [] },
            { type: "bar", title: "x", labels: ["a"], values: ["oops"] },
            { type: "bar", title: "x", labels: ["a"], values: [null] },
            {
                type: "line",
                title: "x",
                labels: Array.from(
                    { length: MAX_CHART_POINTS + 1 },
                    (_, i) => `${i}`,
                ),
                values: Array.from({ length: MAX_CHART_POINTS + 1 }, () => 1),
            },
        ]) {
            expect(normalizeChartSpec(bad)).toBeNull();
        }
    });

    test("trims and caps labels/title/unit", () => {
        const spec = normalizeChartSpec({
            type: "pie",
            title: "T".repeat(100),
            labels: [`${"很长的名字"}`.repeat(20)],
            values: [1],
            unit: `${"u".repeat(20)}`,
        });
        expect(spec?.title.length).toBeLessThanOrEqual(60);
        expect(spec?.labels[0]?.length).toBeLessThanOrEqual(40);
        expect(spec?.unit.length).toBeLessThanOrEqual(8);
    });
});
