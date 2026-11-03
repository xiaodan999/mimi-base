import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
    endOfDay,
    format,
    isSameDay,
    parse,
    startOfMonth,
    subDays,
} from "date-fns/esm";
import { zhCN } from "date-fns/locale";
import { Trash2, Wallet } from "lucide-react";
import { DateRange } from "react-day-picker";

import { ErrorState } from "@/components/ErrorState";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import CalendarDateRangePicker from "@/components/ui/shadcn-date-range-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import { toastPromise } from "@/lib/toast-promise";
import { cn } from "@/lib/utils";

import { getExpenseCategory } from "./-categories";
import AddJiZhangForm from "./-components/add-ji-zhang-form";
import { useDeleteJiZhang, useJiZhang } from "./-data";
import {
    buildTrend,
    sumExpenses,
    summarizeDays,
    type ExpenseDay,
    type ExpenseSummary,
    type TrendPoint,
} from "./-summary";

export const Route = createFileRoute("/_protected/_main/jizhang/")({
    component: Page,
});

function Page() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>(() => ({
        from: startOfMonth(new Date()),
        to: endOfDay(new Date()),
    }));
    const { data, isPending, isError, error, isRefetching, refetch } =
        useJiZhang(dateRange);

    const days = useMemo(() => data ?? [], [data]);
    const from = dateRange?.from;
    const to = dateRange?.to;
    const summary = useMemo(
        () => summarizeDays(days, from, to),
        [days, from, to],
    );
    const trend = useMemo(() => buildTrend(days, from, to), [days, from, to]);

    return (
        <div className="px-4 pb-8 pt-[calc(1rem+env(safe-area-inset-top))]">
            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">
                        秘密基地 · 记账
                    </p>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        记账基地
                    </h1>
                </div>
                <AddJiZhangForm />
            </header>

            {isPending ? (
                <SummarySkeleton />
            ) : isError ? (
                <BrokenSummary date={dateRange} onRangeChange={setDateRange} />
            ) : (
                <SummaryCard
                    summary={summary}
                    trend={trend}
                    date={dateRange}
                    onRangeChange={setDateRange}
                    refreshing={isRefetching}
                />
            )}

            <section className="mt-5" aria-busy={isPending}>
                <div className="mb-2 flex items-baseline justify-between">
                    <h2 className="text-sm font-semibold">明细</h2>
                    {!isPending && !isError && (
                        <span className="text-xs text-muted-foreground">
                            {summary.count} 笔
                        </span>
                    )}
                </div>

                {isPending ? (
                    <JiZhangSkeleton />
                ) : isError ? (
                    <ErrorState
                        message={error.message}
                        onRetry={() => void refetch()}
                    />
                ) : days.length === 0 ? (
                    <EmptyState />
                ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {days.map((day) => (
                            <DayCard key={day.date} day={day} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

function SummaryCard({
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
                    <p className="text-xs font-medium text-muted-foreground">
                        本期支出
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

            {refreshing && (
                <p className="mt-2 text-center text-[10px] text-muted-foreground">
                    更新中…
                </p>
            )}
        </section>
    );
}

function BrokenSummary({
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

function DayCard({ day }: { day: ExpenseDay }) {
    const deleteMutation = useDeleteJiZhang();
    const date = parse(day.date, "yyyy-MM-dd", new Date());
    const now = new Date();
    const isToday = isSameDay(date, now);
    const isYesterday = isSameDay(date, subDays(now, 1));
    const label = isToday
        ? "今天"
        : isYesterday
          ? "昨天"
          : format(date, "M月d日");

    return (
        <article className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-soft">
            <header className="flex items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
                <div className="flex items-baseline gap-2">
                    <h3
                        className={cn(
                            "text-sm font-semibold",
                            isToday && "text-primary",
                        )}
                    >
                        {label}
                    </h3>
                    <span className="text-[11px] text-muted-foreground">
                        {format(date, "EEE", { locale: zhCN })}
                    </span>
                </div>
                <span className="text-sm font-semibold tabular-nums">
                    {formatMoney(sumExpenses(day.items), true)}
                </span>
            </header>

            <ul role="list" className="divide-y divide-border/50">
                {day.items.map((item) => {
                    const category = getExpenseCategory(item.category);
                    const CategoryIcon = category.icon;

                    return (
                        <ContextMenu key={item.id}>
                            <ContextMenuTrigger asChild>
                                <li className="flex items-center gap-3 px-4 py-3 transition-colors hover:cursor-pointer hover:bg-accent/60">
                                    <span
                                        className={cn(
                                            "grid size-9 shrink-0 place-items-center rounded-full",
                                            category.tone,
                                        )}
                                    >
                                        <CategoryIcon
                                            className="size-4"
                                            aria-hidden="true"
                                        />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">
                                            {item.itemName}
                                        </p>
                                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                            {category.label} ·{" "}
                                            {format(
                                                new Date(item.createdAt),
                                                "HH:mm",
                                            )}
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                                        -{formatMoney(item.price)}
                                    </span>
                                </li>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                                <ContextMenuItem
                                    className="text-red-600 hover:cursor-pointer hover:!bg-red-100 hover:!text-red-600"
                                    onClick={() => {
                                        toastPromise(
                                            deleteMutation.mutateAsync(item),
                                            {
                                                loading: "删除中...",
                                                success: "成功删除此项",
                                                error: "删除失败",
                                            },
                                        );
                                    }}
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    <span>删除</span>
                                </ContextMenuItem>
                            </ContextMenuContent>
                        </ContextMenu>
                    );
                })}
            </ul>
        </article>
    );
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/70 bg-card/60 px-6 py-12 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
                <Wallet className="size-6" aria-hidden="true" />
            </span>
            <h3 className="mt-3 text-sm font-semibold">这段时间没有记录</h3>
            <p className="mt-1 text-xs text-muted-foreground">
                换个日期看看，或者从右上角记一笔。
            </p>
        </div>
    );
}

function SummarySkeleton() {
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

function JiZhangSkeleton() {
    return (
        <div className="grid gap-3" aria-busy="true" aria-label="账目加载中">
            {[0, 1].map((index) => (
                <div
                    key={index}
                    className="rounded-2xl border border-border/60 bg-card p-4 shadow-soft"
                >
                    <div className="mb-4 flex items-center justify-between">
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-4 w-20" />
                    </div>
                    <div className="space-y-3">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                </div>
            ))}
        </div>
    );
}
