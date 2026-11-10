import { Check, MapPin } from "lucide-react";
import { useMemo } from "react";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type FeedbackPageOption = {
    /** TanStack Router pathname, e.g. `/chat` or `/chat/<id>`. */
    path: string;
    label: string;
};

/**
 * Main pages of the app offered by the picker. Labels mirror the bottom nav
 * and the 我的 page; `/about`, `/report` and `/feedback` have no nav entry but
 * are common places to report from.
 */
export const FEEDBACK_PAGES: readonly FeedbackPageOption[] = [
    { path: "/home", label: "首页" },
    { path: "/chat", label: "聊天" },
    { path: "/jizhang", label: "记账" },
    { path: "/study", label: "学习" },
    { path: "/profile", label: "我的" },
    { path: "/report", label: "年度报告" },
    { path: "/about", label: "关于" },
    { path: "/feedback", label: "反馈页" },
];

/**
 * Picker choices. A remembered deep link (`/chat/<id>`,
 * `/study/<subject>/<section>`, ...) is kept as the first 最近访问 option so
 * that correcting the page never loses the precise path the app captured.
 */
export function feedbackPageOptions(recent: string): FeedbackPageOption[] {
    const path = recent.trim();
    if (!path || FEEDBACK_PAGES.some((page) => page.path === path)) {
        return [...FEEDBACK_PAGES];
    }
    return [{ path, label: "最近访问" }, ...FEEDBACK_PAGES];
}

/**
 * Page selector for the feedback forms. The remembered route is only the
 * default: the panel owns the selection and submits exactly what is shown.
 */
export function PagePicker({
    open,
    onOpenChange,
    value,
    recent,
    onSelect,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    value: string;
    /** What `readLastRoute()` returned when the panel mounted. */
    recent: string;
    onSelect: (route: string) => void;
}) {
    const options = useMemo(() => feedbackPageOptions(recent), [recent]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm rounded-2xl">
                <DialogHeader>
                    <DialogTitle>反馈哪个页面</DialogTitle>
                    <DialogDescription>
                        自动带上的页面不一定是你想反馈的那一页，点一下改成正确的页面。
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-[55vh] space-y-1.5 overflow-y-auto">
                    {options.map((option) => {
                        const active = option.path === value;
                        return (
                            <button
                                key={option.path}
                                type="button"
                                aria-pressed={active}
                                className={cn(
                                    "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors active:bg-accent",
                                    active
                                        ? "border-primary/40 bg-primary/5"
                                        : "border-border/60",
                                )}
                                onClick={() => {
                                    onSelect(option.path);
                                    onOpenChange(false);
                                }}
                            >
                                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                                    <MapPin
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium">
                                        {option.label}
                                    </span>
                                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                                        {option.path}
                                    </span>
                                </span>
                                {active && (
                                    <Check
                                        className="size-4 shrink-0 text-primary"
                                        aria-hidden="true"
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </DialogContent>
        </Dialog>
    );
}
