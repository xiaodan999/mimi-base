import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastPromise } from "@/lib/toast-promise";
import { cn } from "@/lib/utils";

import {
    useAddDinnerOption,
    useDeleteDinnerOption,
    useRenameDinnerOption,
} from "../data";
import {
    dinnerNameError,
    type DinnerOption,
    MAX_DINNER_NAME_LENGTH,
    normalizeDinnerName,
} from "../options";

type DinnerManagerProps = {
    options: DinnerOption[];
};

/**
 * Add / rename / delete the shared dinner list. It sits inline on the dinner
 * page instead of behind a nested overlay, so the wheel stays in view and the
 * list gets the full width it needs for inline rename errors.
 */
export function DinnerManager({ options }: DinnerManagerProps) {
    const addOption = useAddDinnerOption();
    const renameOption = useRenameDinnerOption();
    const deleteOption = useDeleteDinnerOption();

    const [draft, setDraft] = useState("");
    const [addError, setAddError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState("");
    const [editError, setEditError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<DinnerOption | null>(null);

    const handleAdd = async () => {
        const error = dinnerNameError(draft, options);
        setAddError(error);
        if (error) return;
        const name = normalizeDinnerName(draft);
        try {
            await toastPromise(addOption.mutateAsync(name), {
                loading: "正在加进转盘…",
                success: `「${name}」已加进转盘`,
                error: "添加失败，稍后再试",
            });
            setDraft("");
            setAddError(null);
        } catch {
            // toastPromise surfaced the error.
        }
    };

    const startEditing = (option: DinnerOption) => {
        setEditingId(option.id);
        setEditDraft(option.name);
        setEditError(null);
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditDraft("");
        setEditError(null);
    };

    const handleRename = async (option: DinnerOption) => {
        const error = dinnerNameError(editDraft, options, option.id);
        setEditError(error);
        if (error) return;
        const name = normalizeDinnerName(editDraft);
        if (name === option.name) {
            cancelEditing();
            return;
        }
        try {
            await toastPromise(
                renameOption.mutateAsync({ id: option.id, name }),
                {
                    loading: "正在改名…",
                    success: `已改名为「${name}」`,
                    error: "改名失败，稍后再试",
                },
            );
            cancelEditing();
        } catch {
            // toastPromise surfaced the error.
        }
    };

    const handleDelete = async () => {
        if (!deleting) return;
        const option = deleting;
        try {
            await toastPromise(deleteOption.mutateAsync(option.id), {
                loading: "正在删除…",
                success: `已从转盘移除「${option.name}」`,
                error: "删除失败，稍后再试",
            });
            setDeleting(null);
            if (editingId === option.id) cancelEditing();
        } catch {
            // toastPromise surfaced the error.
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold">
                        管理晚餐选项
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        两个人共享同一份菜单 · 共 {options.length} 个
                    </p>
                </div>
            </div>

            <form
                className="flex items-start gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    void handleAdd();
                }}
            >
                <div className="min-w-0 flex-1">
                    <label htmlFor="dinner-option-name" className="sr-only">
                        新的晚餐选项
                    </label>
                    <Input
                        id="dinner-option-name"
                        value={draft}
                        maxLength={MAX_DINNER_NAME_LENGTH}
                        placeholder="比如：火锅、烧烤…"
                        autoComplete="off"
                        enterKeyHint="done"
                        onChange={(event) => {
                            setDraft(event.target.value);
                            if (addError) setAddError(null);
                        }}
                        aria-invalid={Boolean(addError)}
                        aria-describedby={
                            addError ? "dinner-option-error" : undefined
                        }
                    />
                </div>
                <Button
                    type="submit"
                    className="h-10 shrink-0 gap-1.5 px-3"
                    disabled={addOption.isPending || !draft.trim()}
                >
                    <Plus className="size-4" aria-hidden="true" />
                    添加
                </Button>
            </form>
            {addError && (
                <p
                    id="dinner-option-error"
                    role="alert"
                    className="-mt-2 text-xs text-destructive"
                >
                    {addError}
                </p>
            )}

            {options.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    还没有选项，在上面加一个想吃的吧。
                </div>
            ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                    {options.map((option) => {
                        const isEditing = editingId === option.id;
                        return (
                            <li
                                key={option.id}
                                className={cn(
                                    "rounded-xl border border-border/70 bg-card px-3 py-2 transition-colors",
                                    isEditing &&
                                        "border-primary/40 bg-primary/5",
                                )}
                            >
                                {isEditing ? (
                                    <form
                                        className="flex flex-col gap-2"
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            void handleRename(option);
                                        }}
                                    >
                                        <label
                                            htmlFor={`dinner-rename-${option.id}`}
                                            className="sr-only"
                                        >
                                            新的名字
                                        </label>
                                        <Input
                                            id={`dinner-rename-${option.id}`}
                                            value={editDraft}
                                            maxLength={MAX_DINNER_NAME_LENGTH}
                                            autoFocus
                                            enterKeyHint="done"
                                            aria-invalid={Boolean(editError)}
                                            onChange={(event) => {
                                                setEditDraft(
                                                    event.target.value,
                                                );
                                                if (editError)
                                                    setEditError(null);
                                            }}
                                        />
                                        {editError && (
                                            <p
                                                role="alert"
                                                className="text-xs text-destructive"
                                            >
                                                {editError}
                                            </p>
                                        )}
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 gap-1"
                                                onClick={cancelEditing}
                                            >
                                                <X
                                                    className="size-3.5"
                                                    aria-hidden="true"
                                                />
                                                取消
                                            </Button>
                                            <Button
                                                type="submit"
                                                size="sm"
                                                className="h-8 gap-1"
                                                disabled={
                                                    renameOption.isPending
                                                }
                                            >
                                                <Check
                                                    className="size-3.5"
                                                    aria-hidden="true"
                                                />
                                                保存
                                            </Button>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="flex items-center gap-1">
                                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                            {option.name}
                                        </span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="size-9 shrink-0 text-muted-foreground"
                                            aria-label={`重命名 ${option.name}`}
                                            onClick={() => startEditing(option)}
                                        >
                                            <Pencil
                                                className="size-4"
                                                aria-hidden="true"
                                            />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                                            aria-label={`删除 ${option.name}`}
                                            onClick={() => setDeleting(option)}
                                        >
                                            <Trash2
                                                className="size-4"
                                                aria-hidden="true"
                                            />
                                        </Button>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            <ConfirmDialog
                open={Boolean(deleting)}
                onOpenChange={(open) => {
                    if (!open) setDeleting(null);
                }}
                title={`删除「${deleting?.name ?? ""}」？`}
                description="删除后它不会再出现在转盘上，已经抽到并保存的动态不受影响。"
                confirmLabel="删除"
                destructive
                busy={deleteOption.isPending}
                onConfirm={() => void handleDelete()}
            />
        </div>
    );
}
