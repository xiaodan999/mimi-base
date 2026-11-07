import { describe, expect, test } from "bun:test";

import { MAX_UI_BLOCKS, normalizeUiSpec } from "./ui-spec";

const validChart = {
    type: "pie" as const,
    title: "分类",
    labels: ["餐饮", "购物"],
    values: [187.07, 125.91],
    unit: "元",
};

describe("normalizeUiSpec", () => {
    test("accepts every block type and applies defaults", () => {
        const spec = normalizeUiSpec({
            title: " 本月小结 ",
            subtitle: "2026-11",
            tone: "primary",
            blocks: [
                {
                    type: "text",
                    text: " 这个月花得不多。 ",
                    variant: "caption",
                    align: "center",
                },
                {
                    type: "metrics",
                    items: [
                        {
                            label: "总支出",
                            value: 320.5,
                            unit: "元",
                            hint: "比上月少",
                        },
                    ],
                },
                {
                    type: "list",
                    items: [{ label: "餐饮", value: "187.07 元" }],
                },
                {
                    type: "table",
                    columns: ["分类", "金额"],
                    rows: [
                        ["餐饮", 187.07],
                        ["购物", "125.91"],
                    ],
                },
                {
                    type: "progress",
                    label: "预算",
                    value: 320.5,
                    max: 500,
                },
                {
                    type: "badges",
                    items: ["省钱", { label: "超支", tone: "danger" }],
                },
                {
                    type: "chart",
                    chart: {
                        ...validChart,
                        style: {
                            palette: "multi",
                            donut: true,
                            legend: "bottom",
                            showValues: false,
                        },
                    },
                },
                { type: "divider" },
            ],
        });

        expect(spec).not.toBeNull();
        expect(spec?.title).toBe("本月小结");
        expect(spec?.subtitle).toBe("2026-11");
        expect(spec?.tone).toBe("primary");
        expect(spec?.blocks).toHaveLength(8);
        expect(spec?.blocks[0]).toEqual({
            type: "text",
            text: "这个月花得不多。",
            variant: "caption",
            tone: "default",
            align: "center",
        });
        expect(spec?.blocks[1]).toEqual({
            type: "metrics",
            items: [
                {
                    label: "总支出",
                    value: "320.5",
                    unit: "元",
                    hint: "比上月少",
                    tone: "default",
                },
            ],
        });
        expect(spec?.blocks[3]).toEqual({
            type: "table",
            columns: ["分类", "金额"],
            rows: [
                ["餐饮", "187.07"],
                ["购物", "125.91"],
            ],
        });
        expect(spec?.blocks[4]).toEqual({
            type: "progress",
            label: "预算",
            value: 320.5,
            max: 500,
            tone: "default",
        });
        expect(spec?.blocks[5]).toEqual({
            type: "badges",
            items: [
                { label: "省钱", tone: "default" },
                { label: "超支", tone: "danger" },
            ],
        });
        expect(spec?.blocks[6]).toMatchObject({
            type: "chart",
            chart: {
                type: "pie",
                style: {
                    palette: "multi",
                    donut: true,
                    legend: "bottom",
                    showValues: false,
                },
            },
        });
        expect(spec?.blocks[7]).toEqual({ type: "divider" });
    });

    test("drops unknown, empty and invalid blocks but keeps the rest", () => {
        const spec = normalizeUiSpec({
            blocks: [
                { type: "nope", text: "x" },
                { type: "text", text: "ok" },
                { type: "text", text: "   " },
                { type: "metrics", items: [] },
                { type: "chart", chart: { type: "scatter" } },
                { type: "divider" },
            ],
        });
        expect(spec?.blocks).toEqual([
            {
                type: "text",
                text: "ok",
                variant: "body",
                tone: "default",
                align: "left",
            },
            { type: "divider" },
        ]);
    });

    test("rejects payloads with no usable blocks", () => {
        for (const bad of [
            null,
            "card",
            [],
            {},
            { blocks: [] },
            { blocks: "x" },
            { blocks: [null, 1, "x"] },
            { blocks: [{ type: "text", text: "" }] },
        ]) {
            expect(normalizeUiSpec(bad)).toBeNull();
        }
    });

    test("caps block counts and text lengths", () => {
        const spec = normalizeUiSpec({
            title: "T".repeat(100),
            subtitle: "S".repeat(200),
            blocks: [
                { type: "text", text: "x".repeat(600) },
                {
                    type: "metrics",
                    items: Array.from({ length: 5 }, (_, index) => ({
                        label: `label-${index}`.padEnd(100, "l"),
                        value: `value-${index}`.padEnd(100, "v"),
                        unit: "u".repeat(20),
                        hint: "h".repeat(100),
                    })),
                },
                {
                    type: "list",
                    items: Array.from({ length: 30 }, (_, index) => ({
                        label: `item-${index}`.padEnd(100, "l"),
                        value: "v".repeat(100),
                        hint: "h".repeat(100),
                    })),
                },
                {
                    type: "table",
                    columns: Array.from({ length: 10 }, () => "c"),
                    rows: Array.from({ length: 30 }, () => [
                        "x".repeat(100),
                        "y",
                    ]),
                },
                {
                    type: "badges",
                    items: Array.from({ length: 12 }, () => "b".repeat(30)),
                },
                ...Array.from({ length: MAX_UI_BLOCKS }, () => ({
                    type: "divider",
                })),
            ],
        });

        expect(spec?.title.length).toBe(60);
        expect(spec?.subtitle.length).toBe(120);
        expect(spec?.blocks).toHaveLength(MAX_UI_BLOCKS);
        const text = spec?.blocks[0];
        expect(text?.type).toBe("text");
        if (text?.type === "text") expect(text.text.length).toBe(500);

        const metrics = spec?.blocks[1];
        expect(metrics?.type).toBe("metrics");
        if (metrics?.type === "metrics") {
            expect(metrics.items).toHaveLength(3);
            expect(metrics.items[0]?.label.length).toBe(80);
            expect(metrics.items[0]?.value.length).toBe(40);
            expect(metrics.items[0]?.unit.length).toBe(8);
            expect(metrics.items[0]?.hint.length).toBe(80);
        }

        const list = spec?.blocks[2];
        expect(list?.type).toBe("list");
        if (list?.type === "list") {
            expect(list.items).toHaveLength(20);
            expect(list.items[0]?.label.length).toBe(80);
            expect(list.items[0]?.value.length).toBe(40);
            expect(list.items[0]?.hint.length).toBe(80);
        }

        const table = spec?.blocks[3];
        expect(table?.type).toBe("table");
        if (table?.type === "table") {
            expect(table.columns).toHaveLength(6);
            expect(table.rows).toHaveLength(20);
            expect(table.rows[0]?.[0]?.length).toBe(80);
            expect(table.rows[0]).toHaveLength(6);
        }

        const badges = spec?.blocks[4];
        expect(badges?.type).toBe("badges");
        if (badges?.type === "badges") {
            expect(badges.items).toHaveLength(8);
            expect(badges.items[0]?.label.length).toBe(24);
        }
    });

    test("clamps progress values and rejects invalid ranges", () => {
        const clamped = normalizeUiSpec({
            blocks: [{ type: "progress", label: "预算", value: 900, max: 500 }],
        });
        expect(clamped?.blocks[0]).toEqual({
            type: "progress",
            label: "预算",
            value: 500,
            max: 500,
            tone: "default",
        });

        const negative = normalizeUiSpec({
            blocks: [{ type: "progress", label: "预算", value: -5, max: 500 }],
        });
        expect(negative?.blocks[0]).toMatchObject({ value: 0 });

        for (const max of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(
                normalizeUiSpec({
                    blocks: [{ type: "progress", label: "x", value: 1, max }],
                }),
            ).toBeNull();
        }
    });

    test("falls back to safe typography values", () => {
        const spec = normalizeUiSpec({
            blocks: [
                {
                    type: "text",
                    text: "x",
                    variant: "huge",
                    tone: "neon",
                    align: "justify",
                },
            ],
        });
        expect(spec?.blocks[0]).toEqual({
            type: "text",
            text: "x",
            variant: "body",
            tone: "default",
            align: "left",
        });
    });

    test("rejects specs above the size cap", () => {
        const chart = {
            type: "bar" as const,
            title: "很长的图表",
            labels: Array.from({ length: 30 }, (_, index) =>
                `分类${index}`.padEnd(40, "长"),
            ),
            values: Array.from({ length: 30 }, () => 1),
        };
        const spec = normalizeUiSpec({
            blocks: Array.from({ length: MAX_UI_BLOCKS }, () => ({
                type: "chart",
                chart,
            })),
        });
        expect(spec).toBeNull();
    });
});
