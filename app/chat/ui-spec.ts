import {
    CHART_LEGENDS,
    CHART_PALETTES,
    type ChartSpec,
    normalizeChartSpec,
} from "./chart";

/**
 * Declarative cards for the `render_ui` tool. The model fills a JSON tree of
 * whitelisted blocks; this module is the boundary: unknown or malformed data
 * is dropped, strings are capped, and no HTML/CSS/URLs are accepted. The
 * renderer turns the normalized spec into fixed React components styled with
 * theme-token classes only.
 */

export const UI_TONES = [
    "default",
    "muted",
    "primary",
    "success",
    "warning",
    "danger",
] as const;
export type UiTone = (typeof UI_TONES)[number];

export const UI_TEXT_VARIANTS = ["title", "body", "caption", "label"] as const;
export type UiTextVariant = (typeof UI_TEXT_VARIANTS)[number];

export const UI_ALIGNS = ["left", "center", "right"] as const;
export type UiAlign = (typeof UI_ALIGNS)[number];

export type UiMetric = {
    label: string;
    value: string;
    unit: string;
    hint: string;
    tone: UiTone;
};

export type UiListItem = {
    label: string;
    value: string;
    hint: string;
};

export type UiBadge = {
    label: string;
    tone: UiTone;
};

export type UiBlock =
    | {
          type: "text";
          text: string;
          variant: UiTextVariant;
          tone: UiTone;
          align: UiAlign;
      }
    | { type: "metrics"; items: UiMetric[] }
    | { type: "list"; items: UiListItem[] }
    | { type: "table"; columns: string[]; rows: string[][] }
    | {
          type: "progress";
          label: string;
          value: number;
          max: number;
          tone: UiTone;
      }
    | { type: "badges"; items: UiBadge[] }
    | { type: "chart"; chart: ChartSpec }
    | { type: "divider" };

export type UiSpec = {
    title: string;
    subtitle: string;
    tone: UiTone;
    blocks: UiBlock[];
};

export const MAX_UI_BLOCKS = 12;
export const MAX_UI_SPEC_CHARS = 12_000;

const MAX_METRICS = 3;
const MAX_LIST_ITEMS = 20;
const MAX_TABLE_COLUMNS = 6;
const MAX_TABLE_ROWS = 20;
const MAX_BADGES = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Display strings may arrive as numbers; both are capped, never interpreted. */
function asText(value: unknown, max: number): string {
    if (typeof value === "string") return value.trim().slice(0, max);
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value).slice(0, max);
    }
    return "";
}

function asNumber(value: unknown): number {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : Number.NaN;
    }
    if (typeof value === "string" && value.trim() !== "") return Number(value);
    return Number.NaN;
}

function asTone(value: unknown): UiTone {
    return typeof value === "string" &&
        (UI_TONES as readonly string[]).includes(value)
        ? (value as UiTone)
        : "default";
}

function asVariant(value: unknown): UiTextVariant {
    return typeof value === "string" &&
        (UI_TEXT_VARIANTS as readonly string[]).includes(value)
        ? (value as UiTextVariant)
        : "body";
}

function asAlign(value: unknown): UiAlign {
    return typeof value === "string" &&
        (UI_ALIGNS as readonly string[]).includes(value)
        ? (value as UiAlign)
        : "left";
}

function normalizeMetric(raw: unknown): UiMetric | null {
    if (!isRecord(raw)) return null;
    const label = asText(raw.label, 80);
    const value = asText(raw.value, 40);
    if (label === "" || value === "") return null;
    return {
        label,
        value,
        unit: asText(raw.unit, 8),
        hint: asText(raw.hint, 80),
        tone: asTone(raw.tone),
    };
}

function normalizeListItem(raw: unknown): UiListItem | null {
    if (!isRecord(raw)) return null;
    const label = asText(raw.label, 80);
    if (label === "") return null;
    return {
        label,
        value: asText(raw.value, 40),
        hint: asText(raw.hint, 80),
    };
}

function normalizeBadge(raw: unknown): UiBadge | null {
    if (typeof raw === "string") {
        const label = asText(raw, 24);
        return label === "" ? null : { label, tone: "default" };
    }
    if (!isRecord(raw)) return null;
    const label = asText(raw.label, 24);
    return label === "" ? null : { label, tone: asTone(raw.tone) };
}

function normalizeTable(raw: Record<string, unknown>): UiBlock | null {
    if (!Array.isArray(raw.columns) || !Array.isArray(raw.rows)) return null;
    const columns = raw.columns
        .slice(0, MAX_TABLE_COLUMNS)
        .map((column) => asText(column, 80));
    if (columns.length === 0 || columns.every((column) => column === "")) {
        return null;
    }

    const rows: string[][] = [];
    for (const rawRow of raw.rows.slice(0, MAX_TABLE_ROWS)) {
        if (!Array.isArray(rawRow)) continue;
        const cells = rawRow
            .slice(0, columns.length)
            .map((cell) => asText(cell, 80));
        while (cells.length < columns.length) cells.push("");
        if (cells.some((cell) => cell !== "")) rows.push(cells);
    }
    if (rows.length === 0) return null;
    return { type: "table", columns, rows };
}

function normalizeProgress(raw: Record<string, unknown>): UiBlock | null {
    const label = asText(raw.label, 80);
    const value = asNumber(raw.value);
    const max = asNumber(raw.max);
    if (
        label === "" ||
        !Number.isFinite(value) ||
        !Number.isFinite(max) ||
        max <= 0
    ) {
        return null;
    }
    return {
        type: "progress",
        label,
        value: Math.min(Math.max(value, 0), max),
        max,
        tone: asTone(raw.tone),
    };
}

function normalizeBlock(raw: unknown): UiBlock | null {
    if (!isRecord(raw)) return null;
    switch (raw.type) {
        case "text": {
            const text = asText(raw.text, 500);
            if (text === "") return null;
            return {
                type: "text",
                text,
                variant: asVariant(raw.variant),
                tone: asTone(raw.tone),
                align: asAlign(raw.align),
            };
        }
        case "metrics": {
            if (!Array.isArray(raw.items)) return null;
            const items = raw.items
                .slice(0, MAX_METRICS)
                .map(normalizeMetric)
                .filter((item): item is UiMetric => item !== null);
            return items.length === 0 ? null : { type: "metrics", items };
        }
        case "list": {
            if (!Array.isArray(raw.items)) return null;
            const items = raw.items
                .slice(0, MAX_LIST_ITEMS)
                .map(normalizeListItem)
                .filter((item): item is UiListItem => item !== null);
            return items.length === 0 ? null : { type: "list", items };
        }
        case "table":
            return normalizeTable(raw);
        case "progress":
            return normalizeProgress(raw);
        case "badges": {
            if (!Array.isArray(raw.items)) return null;
            const items = raw.items
                .slice(0, MAX_BADGES)
                .map(normalizeBadge)
                .filter((item): item is UiBadge => item !== null);
            return items.length === 0 ? null : { type: "badges", items };
        }
        case "chart": {
            const chart = normalizeChartSpec(raw.chart);
            return chart === null ? null : { type: "chart", chart };
        }
        case "divider":
            return { type: "divider" };
        default:
            return null;
    }
}

export function normalizeUiSpec(input: unknown): UiSpec | null {
    if (!isRecord(input) || !Array.isArray(input.blocks)) return null;

    const blocks: UiBlock[] = [];
    for (const raw of input.blocks) {
        if (blocks.length >= MAX_UI_BLOCKS) break;
        const block = normalizeBlock(raw);
        if (block !== null) blocks.push(block);
    }
    if (blocks.length === 0) return null;

    const spec: UiSpec = {
        title: asText(input.title, 60),
        subtitle: asText(input.subtitle, 120),
        tone: asTone(input.tone),
        blocks,
    };
    if (JSON.stringify(spec).length > MAX_UI_SPEC_CHARS) return null;
    return spec;
}

const TONE_SCHEMA: Record<string, unknown> = {
    type: "string",
    enum: [...UI_TONES],
    description: "语气：default / muted / primary / success / warning / danger",
};

const CHART_SCHEMA: Record<string, unknown> = {
    type: "object",
    properties: {
        type: { type: "string", enum: ["bar", "line", "pie"] },
        title: { type: "string" },
        labels: { type: "array", items: { type: "string" } },
        values: { type: "array", items: { type: "number" } },
        unit: { type: "string" },
        style: {
            type: "object",
            properties: {
                palette: { type: "string", enum: [...CHART_PALETTES] },
                donut: { type: "boolean" },
                legend: { type: "string", enum: [...CHART_LEGENDS] },
                showValues: { type: "boolean" },
            },
            additionalProperties: false,
        },
    },
    required: ["type", "title", "labels", "values"],
    additionalProperties: false,
};

const TEXT_BLOCK_SCHEMA: Record<string, unknown> = {
    type: "object",
    properties: {
        type: { type: "string", enum: ["text"] },
        text: { type: "string", description: "正文，最多 500 字" },
        variant: { type: "string", enum: [...UI_TEXT_VARIANTS] },
        tone: TONE_SCHEMA,
        align: { type: "string", enum: [...UI_ALIGNS] },
    },
    required: ["type", "text"],
    additionalProperties: false,
};

const METRICS_BLOCK_SCHEMA: Record<string, unknown> = {
    type: "object",
    properties: {
        type: { type: "string", enum: ["metrics"] },
        items: {
            type: "array",
            minItems: 1,
            maxItems: MAX_METRICS,
            items: {
                type: "object",
                properties: {
                    label: { type: "string" },
                    value: {
                        type: "string",
                        description: "已经格式化好的数值，如 187.07",
                    },
                    unit: { type: "string" },
                    hint: { type: "string" },
                    tone: TONE_SCHEMA,
                },
                required: ["label", "value"],
                additionalProperties: false,
            },
        },
    },
    required: ["type", "items"],
    additionalProperties: false,
};

const LIST_BLOCK_SCHEMA: Record<string, unknown> = {
    type: "object",
    properties: {
        type: { type: "string", enum: ["list"] },
        items: {
            type: "array",
            minItems: 1,
            maxItems: MAX_LIST_ITEMS,
            items: {
                type: "object",
                properties: {
                    label: { type: "string" },
                    value: { type: "string" },
                    hint: { type: "string" },
                },
                required: ["label"],
                additionalProperties: false,
            },
        },
    },
    required: ["type", "items"],
    additionalProperties: false,
};

const TABLE_BLOCK_SCHEMA: Record<string, unknown> = {
    type: "object",
    properties: {
        type: { type: "string", enum: ["table"] },
        columns: {
            type: "array",
            minItems: 1,
            maxItems: MAX_TABLE_COLUMNS,
            items: { type: "string" },
        },
        rows: {
            type: "array",
            minItems: 1,
            maxItems: MAX_TABLE_ROWS,
            items: { type: "array", items: { type: "string" } },
        },
    },
    required: ["type", "columns", "rows"],
    additionalProperties: false,
};

const PROGRESS_BLOCK_SCHEMA: Record<string, unknown> = {
    type: "object",
    properties: {
        type: { type: "string", enum: ["progress"] },
        label: { type: "string" },
        value: { type: "number" },
        max: { type: "number" },
        tone: TONE_SCHEMA,
    },
    required: ["type", "label", "value", "max"],
    additionalProperties: false,
};

const BADGES_BLOCK_SCHEMA: Record<string, unknown> = {
    type: "object",
    properties: {
        type: { type: "string", enum: ["badges"] },
        items: {
            type: "array",
            minItems: 1,
            maxItems: MAX_BADGES,
            items: {
                type: "object",
                properties: {
                    label: { type: "string" },
                    tone: TONE_SCHEMA,
                },
                required: ["label"],
                additionalProperties: false,
            },
        },
    },
    required: ["type", "items"],
    additionalProperties: false,
};

const CHART_BLOCK_SCHEMA: Record<string, unknown> = {
    type: "object",
    properties: {
        type: { type: "string", enum: ["chart"] },
        chart: CHART_SCHEMA,
    },
    required: ["type", "chart"],
    additionalProperties: false,
};

const DIVIDER_BLOCK_SCHEMA: Record<string, unknown> = {
    type: "object",
    properties: {
        type: { type: "string", enum: ["divider"] },
    },
    required: ["type"],
    additionalProperties: false,
};

export const UI_SPEC_SCHEMA: Record<string, unknown> = {
    type: "object",
    properties: {
        title: { type: "string", description: "卡片标题，简短，可省略" },
        subtitle: { type: "string", description: "副标题，可省略" },
        tone: {
            ...TONE_SCHEMA,
            description: "整张卡片的语气，默认 default",
        },
        blocks: {
            type: "array",
            minItems: 1,
            maxItems: MAX_UI_BLOCKS,
            description:
                "从上到下排列的展示块。所有块都是只读展示，不要用它们模拟按钮、表单或系统弹窗。",
            items: {
                oneOf: [
                    TEXT_BLOCK_SCHEMA,
                    METRICS_BLOCK_SCHEMA,
                    LIST_BLOCK_SCHEMA,
                    TABLE_BLOCK_SCHEMA,
                    PROGRESS_BLOCK_SCHEMA,
                    BADGES_BLOCK_SCHEMA,
                    CHART_BLOCK_SCHEMA,
                    DIVIDER_BLOCK_SCHEMA,
                ],
            },
        },
    },
    required: ["blocks"],
    additionalProperties: false,
};
