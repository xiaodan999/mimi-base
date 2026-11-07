/**
 * Chart payloads for the `show_chart` tool. The model fills a flat schema;
 * everything here is defensive: a bad or hostile payload normalizes to null
 * and the message just keeps its JSON tool card.
 */

export type ChartSpec = {
    type: "bar" | "line" | "pie";
    title: string;
    labels: string[];
    values: number[];
    unit: string;
};

export const MAX_CHART_POINTS = 30;

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

    return { type, title: title.slice(0, 60), labels, values, unit };
}
