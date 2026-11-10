import { Search } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";

import { usePostMonths } from "../data";

type FindSheetProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    activeMonth?: string;
    activeQuery?: string;
    onSelectMonth: (month: string) => void;
    onSearch: (q: string) => void;
    onClear: () => void;
};

/**
 * Bottom sheet for locating an old post: keyword search plus the months that
 * actually contain posts. Choosing one filters the feed instead of opening a
 * separate list, so likes and comments keep working on the results.
 */
export default function FindSheet({
    open,
    onOpenChange,
    activeMonth,
    activeQuery,
    onSelectMonth,
    onSearch,
    onClear,
}: FindSheetProps) {
    const [text, setText] = useState("");
    const { data: months, isPending } = usePostMonths(open);
    const filtering = Boolean(activeMonth || activeQuery);

    useEffect(() => {
        // Start every visit from the currently applied query.
        if (open) setText(activeQuery ?? "");
    }, [open, activeQuery]);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        const value = text.trim();
        if (!value) return;
        onSearch(value);
    };

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent className="kb-max-h h-[85dvh]">
                <DrawerHeader className="border-b pb-3 text-center">
                    <DrawerTitle className="text-base">查找动态</DrawerTitle>
                    <DrawerDescription>
                        搜索内容，或按月份翻看
                    </DrawerDescription>
                </DrawerHeader>

                <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-4">
                    <form className="flex shrink-0 gap-2" onSubmit={submit}>
                        <Input
                            type="search"
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                            placeholder="搜索动态内容"
                            aria-label="搜索动态内容"
                            autoComplete="off"
                            enterKeyHint="search"
                            maxLength={50}
                        />
                        <Button
                            type="submit"
                            className="shrink-0"
                            disabled={!text.trim()}
                        >
                            <Search className="size-4" />
                            搜索
                        </Button>
                    </form>

                    <div className="flex min-h-0 flex-1 flex-col">
                        <p className="mb-2 shrink-0 text-xs font-medium text-muted-foreground">
                            按月份
                        </p>
                        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
                            {isPending ? (
                                <div className="grid place-items-center py-10">
                                    <LoadingSpinner />
                                </div>
                            ) : months && months.length > 0 ? (
                                <div className="space-y-1">
                                    {months.map((month) => {
                                        const active =
                                            month.key === activeMonth;
                                        return (
                                            <button
                                                key={month.key}
                                                type="button"
                                                aria-current={
                                                    active ? "true" : undefined
                                                }
                                                onClick={() =>
                                                    onSelectMonth(month.key)
                                                }
                                                className={cn(
                                                    "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                                                    active
                                                        ? "bg-primary/10 font-semibold text-primary"
                                                        : "hover:bg-accent",
                                                )}
                                            >
                                                <span>{month.label}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    {month.count} 条
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="py-10 text-center text-sm text-muted-foreground">
                                    还没有动态
                                </p>
                            )}
                        </div>
                    </div>

                    {filtering && (
                        <Button
                            type="button"
                            variant="outline"
                            className="shrink-0"
                            onClick={onClear}
                        >
                            回到最新
                        </Button>
                    )}
                </div>
            </DrawerContent>
        </Drawer>
    );
}
