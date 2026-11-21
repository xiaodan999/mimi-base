import { format, isSameDay, parse, subDays } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import { Tags, Trash2 } from "lucide-react";

import type { ExpenseCategory } from "@/app/ledger/categories";
import { type JiZhangItemData, useDeleteJiZhang } from "@/app/ledger/data";
import { type ExpenseDay, sumExpenses } from "@/app/ledger/summary";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { formatMoney } from "@/lib/money";
import { toastPromise } from "@/lib/toast-promise";
import { cn } from "@/lib/utils";

export default function DayCard({
    day,
    getCategory,
    onEdit,
}: {
    day: ExpenseDay;
    getCategory: (value: string | null | undefined) => ExpenseCategory;
    onEdit: (item: JiZhangItemData) => void;
}) {
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
                    const category = getCategory(item.category);
                    const CategoryIcon = category.icon;

                    return (
                        <li key={item.id}>
                            <ContextMenu>
                                <ContextMenuTrigger asChild>
                                    <button
                                        type="button"
                                        onClick={() => onEdit(item)}
                                        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60"
                                    >
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
                                    </button>
                                </ContextMenuTrigger>
                                <ContextMenuContent>
                                    <ContextMenuItem
                                        className="hover:cursor-pointer"
                                        onClick={() => onEdit(item)}
                                    >
                                        <Tags className="mr-2 h-4 w-4" />
                                        <span>改分类</span>
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                        className="text-destructive hover:cursor-pointer hover:bg-destructive/10 hover:text-destructive!"
                                        onClick={() => {
                                            toastPromise(
                                                deleteMutation.mutateAsync(
                                                    item,
                                                ),
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
                        </li>
                    );
                })}
            </ul>
        </article>
    );
}
