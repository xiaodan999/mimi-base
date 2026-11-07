import { useId } from "react";

import {
    normalizeChartSpec,
    pieGeometry,
    type ChartSpec,
} from "@/app/chat/chart";
import { cn } from "@/lib/utils";

/**
 * Inline chart for `show_chart` tool calls, hand-rolled SVG so there is no
 * chart library in the bundle. Colors come from theme utilities (fill-* /
 * stroke-* + opacity), so dark mode works without extra state.
 */

const W = 320;
const H = 170;
const PAD_X = 6;
const PAD_BOTTOM = 22;
const PAD_TOP = 18;

function formatValue(value: number): string {
    if (Number.isInteger(value)) return String(value);
    return String(Math.round(value * 100) / 100);
}

function truncateLabel(label: string, max = 6): string {
    return label.length > max ? `${label.slice(0, max)}…` : label;
}

/** Slice opacity ramp for the pie; stays in one hue family. */
const PIE_OPACITIES = [1, 0.72, 0.5, 0.34, 0.22, 0.14];

/**
 * Literal class names for the multi-color palette: Tailwind only emits classes
 * it can see in source, so never build these with template strings.
 */
const CHART_FILLS = [
    "fill-chart-1",
    "fill-chart-2",
    "fill-chart-3",
    "fill-chart-4",
    "fill-chart-5",
    "fill-chart-6",
] as const;

const CHART_DOTS = [
    "bg-chart-1",
    "bg-chart-2",
    "bg-chart-3",
    "bg-chart-4",
    "bg-chart-5",
    "bg-chart-6",
] as const;

function pieSlice(
    cx: number,
    cy: number,
    r: number,
    start: number,
    end: number,
): string {
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const large = end - start > Math.PI ? 1 : 0;
    return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

function BarChart({ spec }: { spec: ChartSpec }) {
    const max = Math.max(...spec.values, 0.0001) * 1.12;
    const plotW = W - PAD_X * 2;
    const plotH = H - PAD_BOTTOM - PAD_TOP;
    const slot = plotW / spec.labels.length;
    const barW = Math.min(slot * 0.62, 42);
    const showValues = spec.style.showValues && spec.labels.length <= 8;
    const multi = spec.style.palette === "multi";

    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            role="img"
            aria-label={`${spec.title} 柱状图`}
        >
            {spec.values.map((value, index) => {
                const height = Math.max((value / max) * plotH, 2);
                const x = PAD_X + slot * index + (slot - barW) / 2;
                const y = PAD_TOP + plotH - height;
                return (
                    <g key={index}>
                        <rect
                            x={x}
                            y={y}
                            width={barW}
                            height={height}
                            rx={4}
                            className={
                                multi
                                    ? CHART_FILLS[index % CHART_FILLS.length]
                                    : "fill-primary"
                            }
                            opacity={multi ? 1 : 0.85}
                        />
                        {showValues && (
                            <text
                                x={x + barW / 2}
                                y={y - 4}
                                textAnchor="middle"
                                fontSize={10}
                                className="fill-muted-foreground"
                            >
                                {formatValue(value)}
                            </text>
                        )}
                        <text
                            x={x + barW / 2}
                            y={H - 6}
                            textAnchor="middle"
                            fontSize={10}
                            className="fill-muted-foreground"
                        >
                            {truncateLabel(spec.labels[index])}
                        </text>
                    </g>
                );
            })}
            <line
                x1={PAD_X}
                y1={PAD_TOP + plotH}
                x2={W - PAD_X}
                y2={PAD_TOP + plotH}
                className="stroke-border"
                strokeWidth={1}
            />
        </svg>
    );
}

function LineChart({ spec }: { spec: ChartSpec }) {
    const max = Math.max(...spec.values, 0.0001) * 1.12;
    const min = Math.min(...spec.values, 0);
    const range = max - min || 1;
    const plotW = W - PAD_X * 2;
    const plotH = H - PAD_BOTTOM - PAD_TOP;
    const step = spec.labels.length > 1 ? plotW / (spec.labels.length - 1) : 0;
    const points = spec.values.map((value, index) => {
        const x = spec.labels.length > 1 ? PAD_X + step * index : W / 2;
        const y = PAD_TOP + plotH - ((value - min) / range) * plotH;
        return { x, y, value };
    });
    const path = points
        .map(
            (point, index) =>
                `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
        )
        .join(" ");
    const area = `${path} L ${points[points.length - 1]!.x.toFixed(1)} ${PAD_TOP + plotH} L ${points[0]!.x.toFixed(1)} ${PAD_TOP + plotH} Z`;
    const showValues = spec.style.showValues && spec.labels.length <= 8;

    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            role="img"
            aria-label={`${spec.title} 折线图`}
        >
            <path d={area} className="fill-primary" opacity={0.1} />
            <path
                d={path}
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-primary"
            />
            {points.map((point, index) => (
                <g key={index}>
                    <circle
                        cx={point.x}
                        cy={point.y}
                        r={3}
                        className="fill-primary"
                    />
                    {showValues && (
                        <text
                            x={point.x}
                            y={point.y - 8}
                            textAnchor="middle"
                            fontSize={10}
                            className="fill-muted-foreground"
                        >
                            {formatValue(point.value)}
                        </text>
                    )}
                    <text
                        x={point.x}
                        y={H - 6}
                        textAnchor="middle"
                        fontSize={10}
                        className="fill-muted-foreground"
                    >
                        {truncateLabel(spec.labels[index])}
                    </text>
                </g>
            ))}
        </svg>
    );
}

function PieChart({ spec }: { spec: ChartSpec }) {
    const maskId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const total = spec.values.reduce((sum, value) => sum + value, 0);
    if (total <= 0) return null;
    const size = 120;
    const { cx, cy, outerR: r, innerR } = pieGeometry(size);
    const multi = spec.style.palette === "multi";
    const donut = spec.style.donut;
    const legend = spec.style.legend;
    let angle = -Math.PI / 2;

    const chart = (
        <svg
            viewBox={`0 0 ${size} ${size}`}
            className={cn(
                "h-auto w-[120px] shrink-0",
                legend === "right" ? "max-w-[45%]" : "max-w-full",
            )}
            role="img"
            aria-label={`${spec.title} 饼图`}
        >
            {donut && (
                <defs>
                    <mask
                        id={`pie-mask-${maskId}`}
                        maskUnits="userSpaceOnUse"
                        x={0}
                        y={0}
                        width={size}
                        height={size}
                    >
                        <rect width={size} height={size} fill="white" />
                        <circle cx={cx} cy={cy} r={innerR} fill="black" />
                    </mask>
                </defs>
            )}
            <g mask={donut ? `url(#pie-mask-${maskId})` : undefined}>
                {spec.values.map((value, index) => {
                    const sweep = (value / total) * Math.PI * 2;
                    const start = angle;
                    const end = angle + sweep;
                    angle = end;
                    const fill = multi
                        ? CHART_FILLS[index % CHART_FILLS.length]
                        : "fill-primary";
                    if (spec.values.length === 1) {
                        return (
                            <circle
                                key={index}
                                cx={cx}
                                cy={cy}
                                r={r}
                                className={fill}
                            />
                        );
                    }
                    return (
                        <path
                            key={index}
                            d={pieSlice(cx, cy, r, start, end)}
                            className={fill}
                            opacity={
                                multi
                                    ? 1
                                    : PIE_OPACITIES[
                                          index % PIE_OPACITIES.length
                                      ]
                            }
                            stroke="var(--card)"
                            strokeWidth={1.5}
                        />
                    );
                })}
            </g>
        </svg>
    );

    if (legend === "none") {
        return <div className="flex justify-center">{chart}</div>;
    }

    const legendList = (
        <ul
            className={cn(
                "min-w-0 space-y-1 text-xs",
                legend === "right" ? "flex-1" : "w-full",
            )}
        >
            {spec.labels.map((label, index) => (
                <li
                    key={index}
                    className="flex items-center gap-1.5 leading-snug"
                >
                    <span
                        className={cn(
                            "size-2 shrink-0 rounded-full",
                            multi
                                ? CHART_DOTS[index % CHART_DOTS.length]
                                : "bg-primary",
                        )}
                        style={{
                            opacity: multi
                                ? 1
                                : PIE_OPACITIES[index % PIE_OPACITIES.length],
                        }}
                    />
                    <span className="min-w-0 flex-1 truncate text-foreground/90">
                        {truncateLabel(label, 8)}
                    </span>
                    <span className="min-w-0 max-w-[50%] shrink-0 truncate text-right tabular-nums text-muted-foreground">
                        {formatValue(spec.values[index])}
                        {spec.unit ? ` ${spec.unit}` : ""}
                    </span>
                </li>
            ))}
        </ul>
    );

    return (
        <div
            className={cn(
                legend === "right"
                    ? "flex items-center gap-3"
                    : "flex flex-col items-center gap-2",
            )}
        >
            {chart}
            {legendList}
        </div>
    );
}

/** The chart itself, without the outer card, so `render_ui` can embed it. */
export function ChartView({ spec }: { spec: ChartSpec }) {
    return (
        <>
            {spec.type === "bar" && <BarChart spec={spec} />}
            {spec.type === "line" && <LineChart spec={spec} />}
            {spec.type === "pie" && <PieChart spec={spec} />}
        </>
    );
}

/**
 * Renders a `show_chart` tool call as a chart card. Returns null for invalid
 * payloads — the generic tool card still shows the raw JSON in that case.
 */
export function ChartCard({
    data,
    className,
}: {
    data: unknown;
    className?: string;
}) {
    const spec = normalizeChartSpec(data);
    if (!spec) return null;
    const total = spec.values.reduce((sum, value) => sum + value, 0);

    return (
        <div
            className={cn(
                "my-2 overflow-hidden rounded-xl border border-border/60 bg-card/60",
                className,
            )}
        >
            <div className="flex items-baseline justify-between gap-2 border-b border-border/50 px-3 py-2">
                <span className="min-w-0 truncate text-[13px] font-medium">
                    {spec.title}
                </span>
                {(spec.type === "bar" || spec.type === "line") && (
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        合计 {formatValue(total)}
                        {spec.unit ? ` ${spec.unit}` : ""}
                    </span>
                )}
            </div>
            <div className="px-2 py-2">
                <ChartView spec={spec} />
            </div>
        </div>
    );
}
