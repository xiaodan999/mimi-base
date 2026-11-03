import { PropsWithChildren, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { endOfDay, format, startOfMonth } from "date-fns/esm";
import { Banknote, Smile, Trash2 } from "lucide-react";
import { DateRange } from "react-day-picker";
// @ts-expect-error no types
import Masonry, { ResponsiveMasonry } from "react-responsive-masonry";

import { ErrorState } from "@/components/ErrorState";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import CalendarDateRangePicker from "@/components/ui/shadcn-date-range-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { toastPromise } from "@/lib/toast-promise";

import AddJiZhangForm from "./-components/add-ji-zhang-form";
import { JiZhangItemData, useDeleteJiZhang, useJiZhang } from "./-data";

export const Route = createFileRoute("/_protected/_main/jizhang/")({
    component: Page,
});

function Page() {
    const initialStart = startOfMonth(new Date());
    const initialEnd = endOfDay(new Date());
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: initialStart,
        to: initialEnd,
    });
    const { data, isPending, isError, error, isRefetching, refetch } =
        useJiZhang(dateRange);

    if (isError) {
        return (
            <Layout date={dateRange} onRangeChange={setDateRange}>
                <ErrorState
                    message={error.message}
                    onRetry={() => void refetch()}
                />
            </Layout>
        );
    }

    if (isPending) {
        return (
            <Layout date={dateRange} onRangeChange={setDateRange}>
                <JiZhangSkeleton />
            </Layout>
        );
    }

    if (data.length === 0) {
        return (
            <Layout date={dateRange} onRangeChange={setDateRange}>
                <div className="flex flex-1 flex-col items-center justify-center">
                    <Smile className="mb-4 size-16 text-primary" />
                    <h2 className="text-xl">无记录</h2>
                    <p className="text-gray-500">没有找到消费记录</p>
                </div>
            </Layout>
        );
    }

    const monthTotal = data.reduce((acc, { items }) => {
        return acc + getSum(items);
    }, 0);

    return (
        <Layout
            monthTotal={monthTotal}
            date={dateRange}
            onRangeChange={setDateRange}
        >
            <ResponsiveMasonry
                columnsCountBreakPoints={{ 350: 1, 750: 2, 900: 3 }}
            >
                <Masonry gutter="0.5rem">
                    {data.map((day) => (
                        <Group
                            key={day.date}
                            date={day.date}
                            items={day.items}
                        />
                    ))}
                </Masonry>
            </ResponsiveMasonry>

            {isRefetching && (
                <p className="py-1 text-center text-xs text-muted-foreground">
                    更新中…
                </p>
            )}
        </Layout>
    );
}

function JiZhangSkeleton() {
    return (
        <div className="space-y-3" aria-busy="true" aria-label="账目加载中">
            {[0, 1, 2].map((index) => (
                <div
                    key={index}
                    className="rounded-lg border border-border/70 bg-card p-4"
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

function Layout({
    date,
    onRangeChange,
    children,
    monthTotal,
}: PropsWithChildren<{
    monthTotal?: number;
    date: DateRange | undefined;
    onRangeChange: (range: DateRange | undefined) => void;
}>) {
    return (
        <div className="relative flex flex-col p-4">
            <h1 className="text-2xl">记账基地</h1>
            <div className="mb-4 mt-2 flex flex-wrap justify-end gap-2">
                {monthTotal && (
                    <div className="grid place-items-center font-bold text-muted-foreground">
                        🌛 ¥{monthTotal.toFixed(2)}
                    </div>
                )}
                <AddJiZhangForm />
                <CalendarDateRangePicker
                    date={date}
                    onRangeChange={onRangeChange}
                />
            </div>
            {children}
        </div>
    );
}

function Group({ date, items }: { date: string; items: JiZhangItemData[] }) {
    const deleteMutation = useDeleteJiZhang();

    return (
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-soft sm:p-8">
            <div className="mb-4 flex items-center justify-between">
                <h5 className="text-xl font-bold leading-none text-foreground">
                    {date}
                </h5>

                <div className="text-muted-foreground">
                    合计:{" "}
                    <span className="font-bold">
                        ¥{getSum(items).toFixed(2)}
                    </span>
                </div>
            </div>

            <div className="flow-root">
                <ul role="list" className="divide-y divide-border/70">
                    {items.map((item) => (
                        <ContextMenu key={item.id}>
                            <ContextMenuTrigger asChild>
                                <li>
                                    <div className="rounded-md px-2 py-3 transition-colors hover:cursor-pointer hover:bg-accent sm:py-4">
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0">
                                                <Banknote className="text-muted-foreground" />
                                            </div>
                                            <div className="ms-4 min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-foreground">
                                                    {item.itemName}
                                                </p>
                                                <p className="truncate text-sm text-muted-foreground">
                                                    {format(
                                                        new Date(
                                                            item.createdAt,
                                                        ),
                                                        "M月d日 HH:mm",
                                                    )}
                                                </p>
                                            </div>
                                            <div className="inline-flex items-center text-base font-semibold text-foreground">
                                                ¥{item.price}
                                            </div>
                                        </div>
                                    </div>
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
                    ))}
                </ul>
            </div>
        </div>
    );
}

function getSum(items: JiZhangItemData[]) {
    let totalPrice = 0;
    for (let i = 0; i < items.length; i++) {
        totalPrice = items[i].price + totalPrice;
    }
    return totalPrice;
}
