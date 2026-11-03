import {
    addDays,
    differenceInCalendarDays,
    startOfDay,
    subDays,
} from "date-fns/esm";

import { getDateString } from "@/lib/date";

import type { JiZhangItemData } from "./-data";

export type ExpenseDay = {
    date: string;
    items: JiZhangItemData[];
};

export type ExpenseSummary = {
    total: number;
    count: number;
    /** Calendar days covered by the selected range, at least 1. */
    days: number;
    dailyAverage: number;
};

export type TrendPoint = {
    date: string;
    total: number;
};

export function sumExpenses(items: JiZhangItemData[]) {
    return items.reduce((total, item) => total + (item.price || 0), 0);
}

export function summarizeDays(
    days: ExpenseDay[],
    from?: Date,
    to?: Date,
): ExpenseSummary {
    const total = days.reduce((sum, day) => sum + sumExpenses(day.items), 0);
    const count = days.reduce((sum, day) => sum + day.items.length, 0);
    const coveredDays = from
        ? Math.max(1, differenceInCalendarDays(to ?? from, from) + 1)
        : 1;

    return {
        total,
        count,
        days: coveredDays,
        dailyAverage: total / coveredDays,
    };
}

/**
 * Daily totals for the last `maxPoints` days of the selected range, oldest
 * first, zero-filling days without records so the chart keeps a stable width.
 */
export function buildTrend(
    days: ExpenseDay[],
    from?: Date,
    to?: Date,
    maxPoints = 7,
): TrendPoint[] {
    if (!from) return [];

    const end = startOfDay(to ?? from);
    const rangeStart = startOfDay(from);
    const earliest = subDays(end, maxPoints - 1);
    const first =
        differenceInCalendarDays(earliest, rangeStart) > 0
            ? earliest
            : rangeStart;

    const length = differenceInCalendarDays(end, first) + 1;
    if (length <= 0) return [];

    const totals = new Map(
        days.map((day) => [day.date, sumExpenses(day.items)]),
    );

    return Array.from({ length }, (_, index) => {
        const date = getDateString(addDays(first, index));
        return { date, total: totals.get(date) ?? 0 };
    });
}
