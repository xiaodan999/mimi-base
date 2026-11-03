import type { LucideIcon } from "lucide-react";
import {
    Bus,
    Gamepad2,
    HeartPulse,
    House,
    ReceiptText,
    ShoppingBag,
    Utensils,
} from "lucide-react";

export type ExpenseCategoryValue =
    "food" | "transport" | "shopping" | "home" | "fun" | "health" | "other";

export type ExpenseCategory = {
    value: ExpenseCategoryValue;
    label: string;
    icon: LucideIcon;
    /** Tinted chip classes shared by the picker and the list rows. */
    tone: string;
};

/**
 * Ordered as shown in the add form. `other` is also the fallback for legacy
 * rows created before the category field existed.
 */
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
    {
        value: "food",
        label: "吃饭",
        icon: Utensils,
        tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
        value: "transport",
        label: "交通",
        icon: Bus,
        tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    },
    {
        value: "shopping",
        label: "购物",
        icon: ShoppingBag,
        tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    },
    {
        value: "home",
        label: "居家",
        icon: House,
        tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
        value: "fun",
        label: "娱乐",
        icon: Gamepad2,
        tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
    {
        value: "health",
        label: "健康",
        icon: HeartPulse,
        tone: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    },
    {
        value: "other",
        label: "其他",
        icon: ReceiptText,
        tone: "bg-muted text-muted-foreground",
    },
];

const FALLBACK = EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];

export function getExpenseCategory(
    value: string | null | undefined,
): ExpenseCategory {
    return EXPENSE_CATEGORIES.find((item) => item.value === value) ?? FALLBACK;
}
