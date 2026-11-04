import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

import AiSheet from "@/app/ai/AiSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { toastPromise } from "@/lib/toast-promise";
import { cn } from "@/lib/utils";

import {
    BUILTIN_EXPENSE_CATEGORIES,
    type ExpenseCategory,
} from "../-categories";
import {
    useCreateExpenseCategory,
    useDeleteExpenseCategory,
    useExpenseCategories,
    useUpdateExpenseCategory,
} from "../-data";

const REASON = "删除后，用到它的账目会变成未分类。";

/** Rename or delete the user's own categories (built-ins stay fixed). */
export default function ManageCategoriesSheet({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    const { customCategories, isPending } = useExpenseCategories();
    const create = useCreateExpenseCategory();
    const rename = useUpdateExpenseCategory();
    const remove = useDeleteExpenseCategory();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [draftName, setDraftName] = useState("");
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");

    useEffect(() => {
        if (open) return;
        setEditingId(null);
        setDraftName("");
        setConfirmingId(null);
        setCreating(false);
        setNewName("");
    }, [open]);

    const startEdit = (category: ExpenseCategory) => {
        setEditingId(category.value);
        setDraftName(category.label);
        setConfirmingId(null);
    };

    const saveEdit = async () => {
        const trimmed = draftName.trim();
        if (!editingId || !trimmed || rename.isPending) return;

        try {
            await toastPromise(
                rename.mutateAsync({ id: editingId, name: trimmed }),
                {
                    loading: "改名中...",
                    success: "分类名改好了",
                    error: (err) =>
                        err instanceof Error ? err.message : "改名失败",
                },
            );
            setEditingId(null);
        } catch {
            // toastPromise 已经提示过
        }
    };

    const removeCategory = async (id: string) => {
        if (remove.isPending) return;

        try {
            await toastPromise(remove.mutateAsync(id), {
                loading: "删除分类中...",
                success: (count) =>
                    count > 0
                        ? `分类已删除，${count} 笔账目变成未分类`
                        : "分类已删除",
                error: "删除失败",
            });
            setConfirmingId(null);
        } catch {
            // toastPromise 已经提示过
        }
    };

    const createCategory = async () => {
        const trimmed = newName.trim();
        if (!trimmed || create.isPending) return;

        try {
            await toastPromise(create.mutateAsync({ name: trimmed }), {
                loading: "新建分类中...",
                success: "分类建好啦",
                error: (err) =>
                    err instanceof Error ? err.message : "新建失败",
            });
            setNewName("");
            setCreating(false);
        } catch {
            // toastPromise 已经提示过
        }
    };

    return (
        <AiSheet
            open={open}
            onClose={onClose}
            title="分类管理"
            subtitle="内置分类固定不变，自定义分类只属于你自己"
        >
            <div className="space-y-4 pb-2">
                <section className="space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground">
                        内置分类
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {BUILTIN_EXPENSE_CATEGORIES.map(
                            ({ value, label, icon: Icon, tone }) => (
                                <span
                                    key={value}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                                        tone,
                                    )}
                                >
                                    <Icon
                                        className="size-3.5"
                                        aria-hidden="true"
                                    />
                                    {label}
                                </span>
                            ),
                        )}
                    </div>
                </section>

                <section className="space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground">
                        我的分类
                    </h3>

                    {isPending ? (
                        <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-4 text-xs text-muted-foreground">
                            <LoadingSpinner size={14} />
                            加载分类中...
                        </div>
                    ) : customCategories.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border/70 px-4 py-5 text-center text-xs leading-6 text-muted-foreground">
                            还没有自定义分类。记账时点「＋
                            新建」就能加一个，或者用下面的按钮。
                        </p>
                    ) : (
                        <ul className="space-y-1.5">
                            {customCategories.map((category) => {
                                const Icon = category.icon;
                                const editing = editingId === category.value;
                                const confirming =
                                    confirmingId === category.value;

                                return (
                                    <li
                                        key={category.value}
                                        className="rounded-xl border border-border/60 bg-card px-2.5 py-2"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={cn(
                                                    "grid size-8 shrink-0 place-items-center rounded-full",
                                                    category.tone,
                                                )}
                                            >
                                                <Icon
                                                    className="size-4"
                                                    aria-hidden="true"
                                                />
                                            </span>

                                            {editing ? (
                                                <Input
                                                    autoFocus
                                                    value={draftName}
                                                    maxLength={16}
                                                    aria-label={`${category.label} 的新名称`}
                                                    disabled={rename.isPending}
                                                    onChange={(event) =>
                                                        setDraftName(
                                                            event.target.value,
                                                        )
                                                    }
                                                    onKeyDown={(event) => {
                                                        if (
                                                            event.key ===
                                                            "Enter"
                                                        ) {
                                                            event.preventDefault();
                                                            void saveEdit();
                                                        } else if (
                                                            event.key ===
                                                            "Escape"
                                                        ) {
                                                            setEditingId(null);
                                                        }
                                                    }}
                                                    className="h-8 min-w-0 flex-1"
                                                />
                                            ) : (
                                                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                                    {category.label}
                                                </span>
                                            )}

                                            {editing ? (
                                                <>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="size-8 shrink-0"
                                                        aria-label="保存名称"
                                                        disabled={
                                                            !draftName.trim() ||
                                                            rename.isPending
                                                        }
                                                        onClick={() =>
                                                            void saveEdit()
                                                        }
                                                    >
                                                        <Check className="size-4" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="size-8 shrink-0"
                                                        aria-label="取消重命名"
                                                        onClick={() =>
                                                            setEditingId(null)
                                                        }
                                                    >
                                                        <X className="size-4" />
                                                    </Button>
                                                </>
                                            ) : (
                                                <>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="size-8 shrink-0 text-muted-foreground"
                                                        aria-label={`重命名 ${category.label}`}
                                                        onClick={() =>
                                                            startEdit(category)
                                                        }
                                                    >
                                                        <Pencil className="size-4" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                                                        aria-label={`删除 ${category.label}`}
                                                        onClick={() =>
                                                            setConfirmingId(
                                                                confirming
                                                                    ? null
                                                                    : category.value,
                                                            )
                                                        }
                                                    >
                                                        <Trash2 className="size-4" />
                                                    </Button>
                                                </>
                                            )}
                                        </div>

                                        {confirming && (
                                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
                                                <span>{REASON}</span>
                                                <span className="flex gap-1">
                                                    <Button
                                                        type="button"
                                                        variant="destructive"
                                                        size="sm"
                                                        className="h-7 px-2 text-xs"
                                                        disabled={
                                                            remove.isPending
                                                        }
                                                        onClick={() =>
                                                            void removeCategory(
                                                                category.value,
                                                            )
                                                        }
                                                    >
                                                        删除
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-2 text-xs"
                                                        onClick={() =>
                                                            setConfirmingId(
                                                                null,
                                                            )
                                                        }
                                                    >
                                                        取消
                                                    </Button>
                                                </span>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>

                {creating ? (
                    <div className="flex items-center gap-2">
                        <Input
                            autoFocus
                            value={newName}
                            maxLength={16}
                            placeholder="新分类名"
                            aria-label="新分类名称"
                            disabled={create.isPending}
                            className="h-9 flex-1"
                            onChange={(event) => setNewName(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    void createCategory();
                                } else if (event.key === "Escape") {
                                    setCreating(false);
                                    setNewName("");
                                }
                            }}
                        />
                        <Button
                            type="button"
                            size="sm"
                            disabled={!newName.trim() || create.isPending}
                            onClick={() => void createCategory()}
                        >
                            创建
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-9 shrink-0"
                            aria-label="取消新建分类"
                            onClick={() => {
                                setCreating(false);
                                setNewName("");
                            }}
                        >
                            <X className="size-4" />
                        </Button>
                    </div>
                ) : (
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full gap-1.5"
                        onClick={() => setCreating(true)}
                    >
                        <Plus className="size-4" aria-hidden="true" />
                        新建分类
                    </Button>
                )}
            </div>
        </AiSheet>
    );
}
