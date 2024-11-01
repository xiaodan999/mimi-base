import { PropsWithChildren, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { endOfDay, format, startOfDay, startOfMonth } from "date-fns/esm";
import { Banknote, Smile, Trash2 } from "lucide-react";
import { DateRange } from "react-day-picker";
// @ts-expect-error no types
import Masonry, { ResponsiveMasonry } from "react-responsive-masonry";

import LoadingPage from "@/components/LoadingPage";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { toastPromise } from "@/lib/toast-promise";

import AddJiZhangForm from "./-components/add-ji-zhang-form";
import { JiZhangItemData, useDeleteJiZhang, useJiZhang } from "./-data";

export const Route = createFileRoute("/_protected/_main/jizhang/")({
    component: Page,
});

const LOCALE = "zh-Hans-CN";

function Page() {
    const initialStart = startOfMonth(new Date());
    const initialEnd = startOfDay(new Date());
    const [dateRange, setDateRange] = useState<DateRange>({
        from: initialStart,
        to: initialEnd,
    });
    const { data, isPending, isError, error, isRefetching } = useJiZhang({
        start: dateRange.from!.toISOString(),
        end: endOfDay(dateRange.to!).toISOString(),
    });

    if (isError) {
        return <div>Error: {error.message}</div>;
    }

    if (isPending) {
        return (
            <Layout onDateRangeChange={setDateRange}>
                <LoadingPage />
            </Layout>
        );
    }

    if (data.length === 0) {
        return (
            <Layout onDateRangeChange={setDateRange}>
                <div className="flex flex-1 flex-col items-center justify-center">
                    <Smile className="mb-4 size-16 text-blue-600" />
                    <h2 className="text-xl">无记录</h2>
                    <p className="text-gray-500">没有找到消费记录</p>
                </div>
            </Layout>
        );
    }

    return (
        <Layout onDateRangeChange={setDateRange}>
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

            {isRefetching && <LoadingPage />}
        </Layout>
    );
}

function Layout({
    onDateRangeChange,
    children,
}: PropsWithChildren<{
    onDateRangeChange: (range: DateRange) => void;
}>) {
    const initialStart = startOfMonth(new Date());
    const initialEnd = startOfDay(new Date());
    return (
        <div className="relative flex h-full flex-col p-4">
            <h1 className="text-2xl">记账基地</h1>
            <div className="mb-2 flex justify-end gap-2">
                <AddJiZhangForm />

                <DateRangePicker
                    onUpdate={({ range }) => onDateRangeChange(range)}
                    initialDateFrom={initialStart}
                    initialDateTo={initialEnd}
                    align="center"
                    locale={LOCALE}
                    showCompare={false}
                />
            </div>
            {children}
        </div>
    );
}

function Group({ date, items }: { date: string; items: JiZhangItemData[] }) {
    const deleteMutation = useDeleteJiZhang();

    return (
        <div className="rounded-lg border border-green-200 bg-card p-4 text-card shadow sm:p-8">
            <div className="mb-4 flex items-center justify-between">
                <h5 className="text-xl font-bold leading-none text-gray-900">
                    {date}
                </h5>

                <div className="text-muted-foreground">
                    合计:{" "}
                    <span className="font-bold">
                        ￥{getSum(items).toFixed(2)}
                    </span>
                </div>
            </div>

            <div className="flow-root">
                <ul role="list" className="divide-y divide-green-300">
                    {items.map((item) => (
                        <ContextMenu key={item.id}>
                            <ContextMenuTrigger asChild>
                                <li>
                                    <div className="rounded-md px-2 py-3 transition-colors hover:cursor-pointer hover:bg-accent sm:py-4">
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0">
                                                <Banknote className="text-black" />
                                            </div>
                                            <div className="ms-4 min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-gray-900">
                                                    {item.itemName}
                                                </p>
                                                <p className="truncate text-sm text-gray-500">
                                                    {format(
                                                        new Date(
                                                            item.createdAt,
                                                        ),
                                                        "yyyy/M/d, h:mm a",
                                                    )}
                                                </p>
                                            </div>
                                            <div className="inline-flex items-center text-base font-semibold text-gray-900">
                                                ￥{item.price}
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
                                                success: "成功删除此项.",
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
