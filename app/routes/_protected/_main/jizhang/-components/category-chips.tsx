import { Check, Plus, X } from "lucide-react";
import * as React from "react";

import { toastPromise } from "@/lib/toast-promise";
import { cn } from "@/lib/utils";

import type { ExpenseCategory } from "../-categories";
import { useCreateExpenseCategory } from "../-data";

type Props = {
    categories: ExpenseCategory[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    /** Show a trailing ＋ 新建 chip that creates a category inline. */
    allowCreate?: boolean;
};

/** Category chip picker shared by the add form and the edit sheet. */
export default function CategoryChips({
    categories,
    value,
    onChange,
    disabled,
    allowCreate = true,
}: Props) {
    const create = useCreateExpenseCategory();
    const [creating, setCreating] = React.useState(false);
    const [name, setName] = React.useState("");

    const reset = () => {
        setCreating(false);
        setName("");
    };

    const submit = async () => {
        const trimmed = name.trim();
        if (!trimmed || create.isPending) return;
        try {
            const id = await toastPromise(
                create.mutateAsync({ name: trimmed }),
                {
                    loading: "新建分类中...",
                    success: "分类建好啦",
                    error: (err) =>
                        err instanceof Error ? err.message : "新建失败",
                },
            );
            reset();
            onChange(id);
        } catch {
            // toastPromise 已经提示过
        }
    };

    return (
        <div className="flex flex-wrap gap-2">
            {categories.map(({ value: optionValue, label, icon: Icon }) => {
                const active = value === optionValue;
                return (
                    <button
                        key={optionValue}
                        type="button"
                        aria-pressed={active}
                        disabled={disabled}
                        onClick={() => onChange(active ? "" : optionValue)}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                            active
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-border/70 bg-card text-muted-foreground hover:bg-accent",
                        )}
                    >
                        <Icon className="size-3.5" aria-hidden="true" />
                        {label}
                    </button>
                );
            })}

            {allowCreate &&
                (creating ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 py-1 pr-1 pl-3">
                        <input
                            autoFocus
                            value={name}
                            maxLength={16}
                            placeholder="新分类名"
                            aria-label="新分类名称"
                            disabled={create.isPending}
                            onChange={(event) => setName(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    void submit();
                                } else if (event.key === "Escape") {
                                    reset();
                                }
                            }}
                            className="w-20 bg-transparent text-xs"
                        />
                        <button
                            type="button"
                            aria-label="创建分类"
                            disabled={!name.trim() || create.isPending}
                            onClick={() => void submit()}
                            className="grid size-6 place-items-center rounded-full text-primary disabled:opacity-40"
                        >
                            <Check className="size-3.5" />
                        </button>
                        <button
                            type="button"
                            aria-label="取消新建分类"
                            onClick={reset}
                            className="grid size-6 place-items-center rounded-full text-muted-foreground"
                        >
                            <X className="size-3.5" />
                        </button>
                    </span>
                ) : (
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => setCreating(true)}
                        className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
                    >
                        <Plus className="size-3.5" aria-hidden="true" />
                        新建
                    </button>
                ))}
        </div>
    );
}
