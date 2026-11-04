import type { LucideIcon } from "lucide-react";
import {
    Bike,
    BookOpen,
    Bus,
    Car,
    Coffee,
    Dumbbell,
    Gamepad2,
    Gift,
    HeartPulse,
    House,
    PawPrint,
    Plane,
    ReceiptText,
    ShoppingBag,
    Tag,
    Utensils,
    Wrench,
} from "lucide-react";

export type ExpenseCategory = {
    /** Built-in key ("food") or a `ji_zhang_category` record id. */
    value: string;
    label: string;
    icon: LucideIcon;
    /** Tinted chip classes shared by the picker and the list rows. */
    tone: string;
    /** True for user-defined categories. */
    custom?: boolean;
};

export type CategoryIconKey =
    | "utensils"
    | "takeout"
    | "bus"
    | "shopping"
    | "home"
    | "fun"
    | "health"
    | "receipt"
    | "coffee"
    | "paw"
    | "plane"
    | "gift"
    | "dumbbell"
    | "book"
    | "car"
    | "wrench"
    | "tag";

const ICONS: Record<CategoryIconKey, LucideIcon> = {
    utensils: Utensils,
    takeout: Bike,
    bus: Bus,
    shopping: ShoppingBag,
    home: House,
    fun: Gamepad2,
    health: HeartPulse,
    receipt: ReceiptText,
    coffee: Coffee,
    paw: PawPrint,
    plane: Plane,
    gift: Gift,
    dumbbell: Dumbbell,
    book: BookOpen,
    car: Car,
    wrench: Wrench,
    tag: Tag,
};

const TONES: Record<CategoryIconKey, string> = {
    utensils: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    takeout: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    bus: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    shopping: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    home: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    fun: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    health: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    receipt: "bg-muted text-muted-foreground",
    coffee: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    paw: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    plane: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    gift: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    dumbbell: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    book: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    car: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    wrench: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
    tag: "bg-muted text-muted-foreground",
};

type BuiltinDefinition = {
    value: string;
    label: string;
    icon: CategoryIconKey;
};

const BUILTIN_DEFINITIONS: BuiltinDefinition[] = [
    { value: "food", label: "吃饭", icon: "utensils" },
    { value: "takeout", label: "外卖", icon: "takeout" },
    { value: "transport", label: "交通", icon: "bus" },
    { value: "shopping", label: "购物", icon: "shopping" },
    { value: "home", label: "居家", icon: "home" },
    { value: "fun", label: "娱乐", icon: "fun" },
    { value: "health", label: "健康", icon: "health" },
    { value: "other", label: "其他", icon: "receipt" },
];

/**
 * Ordered as shown in the add form. `other` is also the fallback for legacy
 * rows created before the category field existed and for deleted customs.
 */
export const BUILTIN_EXPENSE_CATEGORIES: ExpenseCategory[] =
    BUILTIN_DEFINITIONS.map(({ value, label, icon }) => ({
        value,
        label,
        icon: ICONS[icon],
        tone: TONES[icon],
    }));

const FALLBACK =
    BUILTIN_EXPENSE_CATEGORIES[BUILTIN_EXPENSE_CATEGORIES.length - 1];

export type ExpenseCategoryRecord = {
    id: string;
    name: string;
    icon?: string;
};

/** Turn a `ji_zhang_category` row into a displayable category. */
export function categoryFromRecord(
    record: ExpenseCategoryRecord,
): ExpenseCategory {
    const key = record.icon as CategoryIconKey | undefined;
    const iconKey = key && ICONS[key] ? key : "tag";
    return {
        value: record.id,
        label: record.name.trim() || "未命名",
        icon: ICONS[iconKey],
        tone: TONES[iconKey],
        custom: true,
    };
}

/** Built-ins first, then the user's own categories. */
export function mergeExpenseCategories(
    custom: ExpenseCategory[] = [],
): ExpenseCategory[] {
    return [...BUILTIN_EXPENSE_CATEGORIES, ...custom];
}

export function resolveExpenseCategory(
    value: string | null | undefined,
    categories: ExpenseCategory[],
): ExpenseCategory {
    if (!value) return FALLBACK;
    return categories.find((item) => item.value === value) ?? FALLBACK;
}

export function getExpenseCategory(
    value: string | null | undefined,
    custom: ExpenseCategory[] = [],
): ExpenseCategory {
    return resolveExpenseCategory(value, mergeExpenseCategories(custom));
}

/**
 * AI replies sometimes echo the Chinese label instead of the stored value.
 * Accept both, and treat anything unknown as uncategorized.
 */
export function normalizeCategoryValue(
    raw: string,
    categories: ExpenseCategory[],
): string {
    const text = raw.trim();
    if (!text) return "";
    const match = categories.find(
        (item) => item.value === text || item.label === text,
    );
    return match?.value ?? "";
}

/**
 * Whether a row belongs in 补全分类. With the 其他 toggle off only rows that
 * were never categorized qualify; with it on, every row that renders as 其他
 * does — including a stale value such as a deleted custom category id.
 */
export function needsExpenseCategory(
    value: string | null | undefined,
    includeOther: boolean,
    categories: ExpenseCategory[],
): boolean {
    if (!includeOther) return !value;
    return resolveExpenseCategory(value, categories).value === "other";
}

const ICON_HINTS: [RegExp, CategoryIconKey][] = [
    [/猫|狗|宠物/, "paw"],
    [/咖啡|奶茶|饮料|茶/, "coffee"],
    [/外卖|美团|饿了么|外送/, "takeout"],
    [/旅行|旅游|机票|酒店|度假|景点/, "plane"],
    [/礼物|送礼|红包|份子/, "gift"],
    [/健身|运动|球|跑步|瑜伽|游泳/, "dumbbell"],
    [/书|课|学习|培训|考试|教材/, "book"],
    [/车|打车|地铁|公交|加油|停车|过路/, "car"],
    [/修|维修|工具|五金|安装/, "wrench"],
    [/房租|水电|物业|家居/, "home"],
];

/** Pick a sensible icon for a freshly typed custom category. */
export function guessCategoryIcon(name: string): CategoryIconKey {
    for (const [pattern, key] of ICON_HINTS) {
        if (pattern.test(name)) return key;
    }
    return "tag";
}
