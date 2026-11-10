import { format } from "date-fns";
import { useMemo } from "react";
import { DateRange } from "react-day-picker";

import AiPanel from "@/app/ai/AiPanel";
import { hashText } from "@/app/ai/cache";
import { expenseReviewMessages } from "@/app/ai/expense";
import { useCurrentUser } from "@/lib/auth";

import { getExpenseCategory } from "../-categories";
import { useExpenseCategories } from "../-data";
import { type ExpenseDay, summarizeDays } from "../-summary";

export default function AiExpenseReview({
    open,
    onClose,
    days,
    range,
}: {
    open: boolean;
    onClose: () => void;
    days: ExpenseDay[];
    range: DateRange | undefined;
}) {
    const user = useCurrentUser();
    const { categories } = useExpenseCategories();
    const from = range?.from;
    const to = range?.to;

    const input = useMemo(() => {
        const summary = summarizeDays(days, from, to);
        const categoryMap = new Map<
            string,
            { label: string; total: number; count: number }
        >();
        const items = days.flatMap((day) => day.items);

        for (const item of items) {
            const category = getExpenseCategory(item.category, categories);
            const current = categoryMap.get(category.value) ?? {
                label: category.label,
                total: 0,
                count: 0,
            };
            current.total += item.price;
            current.count += 1;
            categoryMap.set(category.value, current);
        }

        const rangeLabel = from
            ? `${format(from, "M月d日")} - ${format(to ?? from, "M月d日")}`
            : "最近";

        return {
            rangeLabel,
            total: summary.total,
            dailyAverage: summary.dailyAverage,
            days: summary.days,
            count: summary.count,
            categories: [...categoryMap.values()].sort(
                (a, b) => b.total - a.total,
            ),
            topItems: [...items]
                .sort((a, b) => b.price - a.price)
                .slice(0, 5)
                .map((item) => ({ name: item.itemName, price: item.price })),
        };
    }, [days, from, to, categories]);

    const messages = useMemo(() => expenseReviewMessages(input), [input]);
    const cacheKey = `expense-review:${user.id}:${hashText(
        JSON.stringify(input),
    )}`;

    return (
        <AiPanel
            open={open}
            onClose={onClose}
            title="账单点评"
            subtitle={`${input.rangeLabel} · ${input.count} 笔`}
            cacheKey={cacheKey}
            href="/jizhang"
            messages={messages}
            chips={[
                { label: "怎么省？", prompt: "给我三个具体能省钱的改法。" },
                {
                    label: "哪类花得最冤？",
                    prompt: "哪一类花得最不值？说说理由。",
                },
                {
                    label: "下个月预算",
                    prompt: "按现在的水平，给我定一个下个月的预算。",
                },
            ]}
        />
    );
}
