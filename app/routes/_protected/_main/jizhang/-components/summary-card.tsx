import { format, isSameDay, parse } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import type { DateRange } from "react-day-picker";

import type { ExpenseSummary, TrendPoint } from "@/app/ledger/summary";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import CalendarDateRangePicker from "@/components/ui/shadcn-date-range-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export function SummaryCard({
    summary,
    trend,
    date,
    onRangeChange,
    refreshing,
}: {
    summary: ExpenseSummary;
    trend: TrendPoint[];
    date: DateRange | undefined;
    onRangeChange: (range: DateRange | undefined) => void;
    refreshing: boolean;
}) {
    const trendTotal = trend.reduce((sum, point) => sum + point.total, 0);

    return (
        <section className="mt-4 rounded-3xl border border-border/60 bg-card p-5 shadow-soft">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        本期支出
                        {refreshing && (
                            <LoadingSpinner size={12} aria-hidden="true" />
                        )}
                    </p>
                    <p className="mt-1 text-3xl font-semibold tracking-tight">
                        {formatMoney(summary.total)}
                    </p>
                </div>
                <CalendarDateRangePicker
                    compact
                    date={date}
                    onRangeChange={onRangeChange}
                />
            </div>

            <dl className="mt-4 grid grid-cols-2 divide-x divide-border/60">
                <div className="pr-3">
                    <dt className="text-[11px] text-muted-foreground">日均</dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                        {formatMoney(summary.dailyAverage)}
                    </dd>
                </div>
                <div className="pl-3">
                    <dt className="text-[11px] text-muted-foreground">
                        共 {summary.days} 天
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                        {summary.count} 笔
                    </dd>
                </div>
            </dl>

            {trend.length > 0 && (
                <div className="mt-4 border-t border-border/60 pt-3">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>近 {trend.length} 日支出</span>
                        <span className="tabular-nums">
                            {formatMoney(trendTotal, true)}
                        </span>
                    </div>
                    <TrendChart points={trend} />
                </div>
            )}
        </section>
    );
}

export function BrokenSummary({
    date,
    onRangeChange,
}: {
    date: DateRange | undefined;
    onRangeChange: (range: DateRange | undefined) => void;
}) {
    return (
        <section className="mt-4 flex items-start justify-between gap-3 rounded-3xl border border-border/60 bg-card p-5 shadow-soft">
            <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">
                    本期支出
                </p>
                <p className="mt-1 text-3xl font-semibold text-muted-foreground">
                    —
                </p>
            </div>
            <CalendarDateRangePicker
                compact
                date={date}
                onRangeChange={onRangeChange}
            />
        </section>
    );
}

function TrendChart({ points }: { points: TrendPoint[] }) {
    const max = Math.max(1, ...points.map((point) => point.total));
    const today = new Date();
    const label = points
        .map((point) => {
            const date = parse(point.date, "yyyy-MM-dd", new Date());
            return `${format(date, "M月d日")} ${formatMoney(point.total, true)}`;
        })
        .join("，");

    return (
        <div
            role="img"
            aria-label={`近 ${points.length} 日支出趋势：${label}`}
            className="mt-3 flex h-24 items-stretch gap-1.5"
        >
            {points.map((point) => {
                const date = parse(point.date, "yyyy-MM-dd", new Date());
                const isToday = isSameDay(date, today);
                const ratio = point.total / max;

                return (
                    <div
                        key={point.date}
                        className="flex min-w-0 flex-1 flex-col"
                    >
                        <div className="relative flex-1">
                            <div
                                aria-hidden="true"
                                title={`${format(date, "M月d日")} · ${formatMoney(point.total)}`}
                                className={cn(
                                    "absolute inset-x-0 bottom-0 mx-auto max-w-12 rounded-t-md transition-all",
                                    point.total > 0
                                        ? isToday
                                            ? "bg-primary"
                                            : "bg-primary/45"
                                        : "bg-muted",
                                )}
                                style={{
                                    height:
                                        point.total > 0
                                            ? `${Math.max(8, ratio * 100)}%`
                                            : "3px",
                                }}
                            />
                        </div>
                        <span
                            aria-hidden="true"
                            className={cn(
                                "mt-1.5 text-center text-[10px]",
                                isToday
                                    ? "font-semibold text-primary"
                                    : "text-muted-foreground",
                            )}
                        >
                            {format(date, "EEEEE", { locale: zhCN })}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

export function SummarySkeleton() {
    return (
        <div
            className="mt-4 rounded-3xl border border-border/60 bg-card p-5 shadow-soft"
            aria-busy="true"
            aria-label="汇总加载中"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-8 w-36" />
                </div>
                <Skeleton className="h-8 w-32 rounded-full" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
            </div>
            <Skeleton className="mt-4 h-24 w-full" />
        </div>
    );
}
