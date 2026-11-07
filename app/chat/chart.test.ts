import { describe, expect, test } from "bun:test";

import { MAX_CHART_POINTS, normalizeChartSpec, pieGeometry } from "./chart";

describe("pieGeometry", () => {
    test("keeps the pie inside its viewBox, stroke included", () => {
        for (const size of [120, 100, 72]) {
            const { cx, cy, outerR } = pieGeometry(size);
            const stroke = 1.5;
            expect(cx - outerR - stroke / 2).toBeGreaterThanOrEqual(0);
            expect(cx + outerR + stroke / 2).toBeLessThanOrEqual(size);
            expect(cy - outerR - stroke / 2).toBeGreaterThanOrEqual(0);
            expect(cy + outerR + stroke / 2).toBeLessThanOrEqual(size);
        }
    });

    test("centers the pie and keeps the donut hole inside the ring", () => {
        const geometry = pieGeometry(120);
        expect(geometry.cx).toBe(60);
        expect(geometry.cy).toBe(60);
        expect(geometry.innerR).toBeLessThan(geometry.outerR);
        expect(geometry.innerR).toBeGreaterThan(0);
    });
});

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
            style: {
                palette: "theme",
                donut: false,
                legend: "right",
                showValues: true,
            },
        });
    });

    test("accepts style and falls back on unknown values", () => {
        const styled = normalizeChartSpec({
            type: "pie",
            title: "x",
            labels: ["a", "b"],
            values: [1, 2],
            style: {
                palette: "multi",
                donut: true,
                legend: "bottom",
                showValues: false,
            },
        });
        expect(styled?.style).toEqual({
            palette: "multi",
            donut: true,
            legend: "bottom",
            showValues: false,
        });

        for (const style of [
            { palette: "neon", donut: "yes", legend: "left", showValues: "no" },
            "multi",
            null,
            [1],
        ]) {
            expect(
                normalizeChartSpec({
                    type: "pie",
                    title: "x",
                    labels: ["a"],
                    values: [1],
                    style,
                })?.style,
            ).toEqual({
                palette: "theme",
                donut: false,
                legend: "right",
                showValues: true,
            });
        }
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
