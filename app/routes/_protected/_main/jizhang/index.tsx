import { PropsWithChildren, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { endOfDay, format, startOfDay, startOfMonth } from "date-fns/esm";
import { Banknote, Smile } from "lucide-react";
import { DateRange } from "react-day-picker";
// @ts-expect-error no types
import Masonry, { ResponsiveMasonry } from "react-responsive-masonry";

import LoadingPage from "@/components/LoadingPage";
import { DateRangePicker } from "@/components/ui/date-range-picker";

import { JiZhangItemData, useJiZhang } from "./-data";

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
        <div className="flex h-full flex-col p-4">
            <h1 className="text-2xl">记账基地</h1>
            <div className="mb-2 ml-auto">
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
                        <li className="py-3 sm:py-4" key={item.id}>
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
                                            new Date(item.createdAt),
                                            "yyyy/M/d, h:mm a",
                                        )}
                                    </p>
                                </div>
                                <div className="inline-flex items-center text-base font-semibold text-gray-900">
                                    ￥{item.price}
                                </div>
                            </div>
                        </li>
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
