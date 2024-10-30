import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { endOfMonth, startOfMonth } from "date-fns/esm";
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
        to: endOfMonth(new Date()),
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

    return (
        <div>
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
