import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { endOfDay, startOfDay, startOfMonth } from "date-fns/esm";
import { Banknote, Smile } from "lucide-react";
import { DateRange } from "react-day-picker";

import LoadingPage from "@/components/LoadingPage";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";

import { JiZhangItemData, useJiZhang } from "./-data";

export const Route = createFileRoute("/_protected/_main/jizhang/")({
    component: Page,
});

function Page() {
    const [dateRange, setDateRange] = useState<DateRange>(() => ({
        from: startOfMonth(new Date()),
        to: startOfDay(new Date()),
    }));
    const { data, isPending, isError, error, isRefetching } = useJiZhang({
        start: dateRange.from!.toISOString(),
        end: endOfDay(dateRange.to!).toISOString(),
    });

    if (isError) {
        return <div>Error: {error.message}</div>;
    }

    if (isPending) {
        return (
            <div className="flex h-full flex-col">
                <h1>记账基地</h1>
                <DatePickerWithRange
                    className="justify-end"
                    date={dateRange}
                    onSelectDate={setDateRange}
                />
                <LoadingPage />
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="flex h-full flex-col">
                <h1>记账基地</h1>
                <DatePickerWithRange
                    className="justify-end"
                    date={dateRange}
                    onSelectDate={setDateRange}
                />
                <div className="flex flex-1 flex-col items-center justify-center">
                    <Smile className="mb-4 size-16 text-blue-600" />
                    <h2 className="text-xl">无记录</h2>
                    <p className="text-gray-500">没有找到消费记录</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col">
            <h1 className="ml-6 mt-4 text-3xl">记账基地</h1>
            <DatePickerWithRange
                className="justify-end"
                date={dateRange}
                onSelectDate={setDateRange}
            />

            <div className="p-4">
                {data.map((day) => (
                    <Group key={day.date} date={day.date} items={day.items} />
                ))}
            </div>
            {isRefetching && <LoadingPage />}
        </div>
    );
}

function Group({ date, items }: { date: string; items: JiZhangItemData[] }) {
    return (
        <div className="max-w-sm rounded-lg border border-green-200 bg-card p-4 text-card shadow sm:p-8">
            <div className="mb-4 flex items-center justify-between">
                <h5 className="text-xl font-bold leading-none text-gray-900">
                    {date}
                </h5>

                <div className="text-muted-foreground">
                    合计: <span className="font-bold">￥{getSum(items)}</span>
                </div>
            </div>

            <div className="flow-root">
                <ul role="list" className="divide-y divide-gray-200">
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
                                        {new Date(
                                            item.createdAt,
                                        ).toLocaleString()}
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
