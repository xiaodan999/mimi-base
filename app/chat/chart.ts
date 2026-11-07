/**
 * Chart payloads for the `show_chart` tool. The model fills a flat schema;
 * everything here is defensive: a bad or hostile payload normalizes to null
 * and the message just keeps its JSON tool card.
 */

export const CHART_PALETTES = ["theme", "multi"] as const;
export const CHART_LEGENDS = ["right", "bottom", "none"] as const;

export type ChartStyle = {
    /** theme = one primary hue + opacity ramp; multi = distinct chart hues. */
    palette: (typeof CHART_PALETTES)[number];
    /** Pie only: cut a hole in the middle. */
    donut: boolean;
    /** Pie only: where the legend sits. */
    legend: (typeof CHART_LEGENDS)[number];
    /** Bar/line only: label each point; still auto-hidden above 8 points. */
    showValues: boolean;
};

export type ChartSpec = {
    type: "bar" | "line" | "pie";
    title: string;
    labels: string[];
    values: number[];
    unit: string;
    style: ChartStyle;
};

export const MAX_CHART_POINTS = 30;

export const DEFAULT_CHART_STYLE: ChartStyle = {
    palette: "theme",
    donut: false,
    legend: "right",
    showValues: true,
};

function asEnum<T extends string>(
    value: unknown,
    allowed: readonly T[],
    fallback: T,
): T {
    return typeof value === "string" && allowed.includes(value as T)
        ? (value as T)
        : fallback;
}

/** Unknown or hostile style values fall back to the current look. */
function normalizeChartStyle(input: unknown): ChartStyle {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
        return { ...DEFAULT_CHART_STYLE };
    }
    const raw = input as Record<string, unknown>;
    return {
        palette: asEnum(raw.palette, CHART_PALETTES, "theme"),
        donut: raw.donut === true,
        legend: asEnum(raw.legend, CHART_LEGENDS, "right"),
        showValues: raw.showValues !== false,
    };
}

/**
 * A pie must fit inside its own viewBox. The card draws at `size`, so the
 * center stays centered and the radius leaves room for the 1.5px slice stroke;
 * the old `cx = size / 2 + 8` pushed the right edge outside the SVG viewport
 * and clipped it on every screen.
 */
export function pieGeometry(size: number) {
    const outerR = Math.max(size / 2 - 4, 0);
    return {
        cx: size / 2,
        cy: size / 2,
        outerR,
        innerR: outerR * 0.58,
    };
}

export function normalizeChartSpec(input: unknown): ChartSpec | null {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
        return null;
    }
    const raw = input as Record<string, unknown>;

    const type =
        raw.type === "bar" || raw.type === "line" || raw.type === "pie"
            ? raw.type
            : null;
    if (!type) return null;

    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (title === "") return null;

    if (!Array.isArray(raw.labels) || !Array.isArray(raw.values)) return null;
    const count = Math.min(raw.labels.length, raw.values.length);
    if (count < 1 || raw.labels.length !== raw.values.length) return null;
    if (raw.labels.length > MAX_CHART_POINTS) return null;

    const labels: string[] = [];
    const values: number[] = [];
    for (let index = 0; index < count; index++) {
        const label = raw.labels[index];
        const value = raw.values[index];
        if (typeof label !== "string") return null;
        // Numbers only; Number(null)/Number(true) would silently become 0/1.
        const numeric =
            typeof value === "number"
                ? value
                : typeof value === "string" && value.trim() !== ""
                  ? Number(value)
                  : Number.NaN;
        if (!Number.isFinite(numeric)) return null;
        labels.push(label.trim().slice(0, 40));
        values.push(Math.round(numeric * 100) / 100);
    }

    const unit =
        typeof raw.unit === "string" ? raw.unit.trim().slice(0, 8) : "";

    return {
        type,
        title: title.slice(0, 60),
        labels,
        values,
        unit,
        style: normalizeChartStyle(raw.style),
    };
}
