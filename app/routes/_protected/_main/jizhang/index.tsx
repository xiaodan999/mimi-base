import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { startOfMonth } from "date-fns/esm";
import { Smile } from "lucide-react";
import { DateRange } from "react-day-picker";

import LoadingPage from "@/components/LoadingPage";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";

import { useJiZhang } from "./-data";

export const Route = createFileRoute("/_protected/_main/jizhang/")({
    component: Page,
});

function Page() {
    const [dateRange, setDateRange] = useState<DateRange>(() => ({
        from: startOfMonth(new Date()),
        to: new Date(),
    }));
    const { data, isPending, isError, error, isRefetching } = useJiZhang({
        start: dateRange.from!.toISOString(),
        end: dateRange.to!.toISOString(),
    });

    if (isPending) {
        return (
            <div>
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

    if (isError) {
        return <div>Error: {error.message}</div>;
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
                    <p className="text-gray-500">没有当前月份的消费记录</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col">
            <h1>记账基地</h1>
            <DatePickerWithRange
                className="justify-end"
                date={dateRange}
                onSelectDate={setDateRange}
            />

            <pre>{JSON.stringify(data, null, 2)}</pre>
            {isRefetching && <LoadingPage />}
        </div>
    );
}
