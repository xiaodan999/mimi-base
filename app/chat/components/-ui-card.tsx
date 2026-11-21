import {
    normalizeUiSpec,
    type UiAlign,
    type UiBlock,
    type UiTextVariant,
    type UiTone,
} from "@/app/chat/ui-spec";
import { cn } from "@/lib/utils";

import { ChartView } from "./-chart-card";

/**
 * Renders a `render_ui` tool call as a read-only card. Every class below is a
 * literal on a theme token: the model only picks enum values, so Tailwind can
 * compile everything and light/dark keep working.
 */

const TONE_CARD: Record<UiTone, string> = {
    default: "border-border/60 bg-card/60",
    muted: "border-border/60 bg-muted/40",
    primary: "border-primary/30 bg-primary/5",
    success: "border-success/30 bg-success/5",
    warning: "border-warning/30 bg-warning/5",
    danger: "border-destructive/30 bg-destructive/5",
};

const TONE_TEXT: Record<UiTone, string> = {
    default: "text-foreground",
    muted: "text-muted-foreground",
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
};

const TONE_FILL: Record<UiTone, string> = {
    default: "bg-primary",
    muted: "bg-muted-foreground/70",
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-destructive",
};

const TONE_BADGE: Record<UiTone, string> = {
    default: "bg-muted text-foreground",
    muted: "bg-muted/60 text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    danger: "bg-destructive/10 text-destructive",
};

const TEXT_VARIANT: Record<UiTextVariant, string> = {
    title: "text-sm font-semibold",
    body: "text-[13px] leading-relaxed",
    caption: "text-xs leading-relaxed",
    label: "text-[11px] font-medium",
};

const ALIGN: Record<UiAlign, string> = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
};

const METRIC_COLS: Record<number, string> = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-3",
};

function formatNumber(value: number): string {
    if (Number.isInteger(value)) return String(value);
    return String(Math.round(value * 100) / 100);
}

function textTone(variant: UiTextVariant, tone: UiTone): string {
    if (tone !== "default") return TONE_TEXT[tone];
    return variant === "caption" || variant === "label"
        ? "text-muted-foreground"
        : "text-foreground";
}

function Block({ block }: { block: UiBlock }) {
    switch (block.type) {
        case "text":
            return (
                <p
                    className={cn(
                        TEXT_VARIANT[block.variant],
                        textTone(block.variant, block.tone),
                        ALIGN[block.align],
                        "break-words whitespace-pre-wrap",
                    )}
                >
                    {block.text}
                </p>
            );
        case "metrics":
            return (
                <div
                    className={cn(
                        "grid gap-3",
                        METRIC_COLS[block.items.length],
                    )}
                >
                    {block.items.map((item, index) => (
                        <div key={index} className="min-w-0">
                            <div className="truncate text-[11px] text-muted-foreground">
                                {item.label}
                            </div>
                            <div
                                className={cn(
                                    "truncate text-lg font-semibold tabular-nums",
                                    TONE_TEXT[item.tone],
                                )}
                            >
                                {item.value}
                                {item.unit ? (
                                    <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">
                                        {item.unit}
                                    </span>
                                ) : null}
                            </div>
                            {item.hint ? (
                                <div className="truncate text-[11px] text-muted-foreground">
                                    {item.hint}
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>
            );
        case "list":
            return (
                <ul className="divide-y divide-border/50">
                    {block.items.map((item, index) => (
                        <li
                            key={index}
                            className="flex items-start gap-3 py-1.5 first:pt-0 last:pb-0"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px]">
                                    {item.label}
                                </div>
                                {item.hint ? (
                                    <div className="truncate text-[11px] text-muted-foreground">
                                        {item.hint}
                                    </div>
                                ) : null}
                            </div>
                            {item.value ? (
                                <div className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                                    {item.value}
                                </div>
                            ) : null}
                        </li>
                    ))}
                </ul>
            );
        case "table":
            return (
                <div className="-mx-1 overflow-x-auto overscroll-x-contain">
                    <table className="w-full min-w-[240px] border-collapse text-left text-xs">
                        <thead>
                            <tr className="border-b border-border/60">
                                {block.columns.map((column, index) => (
                                    <th
                                        key={index}
                                        className="px-1.5 py-1 font-medium whitespace-nowrap text-muted-foreground"
                                    >
                                        {column}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {block.rows.map((row, rowIndex) => (
                                <tr
                                    key={rowIndex}
                                    className="border-b border-border/40 last:border-0"
                                >
                                    {row.map((cell, cellIndex) => (
                                        <td
                                            key={cellIndex}
                                            className={cn(
                                                "px-1.5 py-1.5 whitespace-nowrap",
                                                cellIndex === 0
                                                    ? "text-foreground"
                                                    : "text-muted-foreground",
                                            )}
                                        >
                                            {cell}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case "progress": {
            const percent = Math.min(
                Math.max((block.value / block.max) * 100, 0),
                100,
            );
            return (
                <div className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate">{block.label}</span>
                        <span className="shrink-0 text-muted-foreground tabular-nums">
                            {formatNumber(block.value)} /{" "}
                            {formatNumber(block.max)}
                        </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                            className={cn(
                                "h-full rounded-full",
                                TONE_FILL[block.tone],
                            )}
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                </div>
            );
        }
        case "badges":
            return (
                <div className="flex flex-wrap gap-1.5">
                    {block.items.map((item, index) => (
                        <span
                            key={index}
                            className={cn(
                                "rounded-full px-2 py-0.5 text-[11px]",
                                TONE_BADGE[item.tone],
                            )}
                        >
                            {item.label}
                        </span>
                    ))}
                </div>
            );
        case "chart":
            return (
                <div className="space-y-1">
                    {block.chart.title ? (
                        <div className="text-[11px] font-medium text-muted-foreground">
                            {block.chart.title}
                        </div>
                    ) : null}
                    <ChartView spec={block.chart} />
                </div>
            );
        case "divider":
            return <div className="border-t border-border/60" />;
    }
}

/**
 * Renders a `render_ui` tool call. Invalid payloads return null; the generic
 * tool card still shows the raw JSON plus the error details.
 */
export function UiCard({ data }: { data: unknown }) {
    const spec = normalizeUiSpec(data);
    if (!spec) return null;

    return (
        <section
            aria-label={spec.title || "AI 生成的卡片"}
            className={cn(
                "my-2 overflow-hidden rounded-xl border",
                TONE_CARD[spec.tone],
            )}
        >
            {spec.title || spec.subtitle ? (
                <div className="border-b border-border/50 px-3 py-2">
                    {spec.title ? (
                        <div className="truncate text-[13px] font-medium">
                            {spec.title}
                        </div>
                    ) : null}
                    {spec.subtitle ? (
                        <div className="truncate text-[11px] text-muted-foreground">
                            {spec.subtitle}
                        </div>
                    ) : null}
                </div>
            ) : null}
            <div className="space-y-3 px-3 py-2.5">
                {spec.blocks.map((block, index) => (
                    <Block key={index} block={block} />
                ))}
            </div>
        </section>
    );
}
