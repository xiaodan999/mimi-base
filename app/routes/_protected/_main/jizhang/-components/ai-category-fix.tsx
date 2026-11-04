import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Tags } from "lucide-react";

import { useAi } from "@/app/ai/AiContext";
import AiSheet from "@/app/ai/AiSheet";
import { aiErrorText, chatJSON } from "@/app/ai/client";
import { categoryGuessMessages } from "@/app/ai/expense";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useCurrentUser } from "@/lib/auth";
import pb from "@/lib/pb";
import { qk } from "@/lib/query-keys";
import { toastPromise } from "@/lib/toast-promise";

import { EXPENSE_CATEGORIES, getExpenseCategory } from "../-categories";

type LegacyRow = { id: string; itemName: string };

type GuessResponse = {
    items?: { name?: unknown; category?: unknown }[];
};

type CategoryUpdate = { id: string; itemName: string; category: string };

type ApplySummary = { done: number; failures: string[] };

// 一次 PATCH 几百笔会把失败面放大：一批挂了，前面补好的行也白等。
const APPLY_BATCH_SIZE = 5;

function pbErrorText(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    return "请稍后重试";
}

const CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map(({ value, label }) => ({
    value,
    label,
}));
const ALLOWED = new Set<string>(CATEGORY_OPTIONS.map((item) => item.value));

function useUncategorizedRows(enabled: boolean) {
    const user = useCurrentUser();
    return useQuery({
        queryKey: qk.jiZhang.uncategorized(user.id),
        enabled,
        queryFn: async (): Promise<LegacyRow[]> => {
            const records = await pb
                .collection("ji_zhang_biao")
                .getFullList<{ id: string; item_name: string }>({
                    // updateRule is owner-scoped, so only list my own rows —
                    // other users' legacy rows would always fail to update.
                    filter: pb.filter(
                        "category = {:empty} && user_id = {:userId}",
                        { empty: "", userId: user.id },
                    ),
                    sort: "created",
                });
            return records.map((record) => ({
                id: record.id,
                itemName: record.item_name,
            }));
        },
    });
}

export default function AiCategoryFix({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    const { settings, configured, openSettings } = useAi();
    const queryClient = useQueryClient();
    const { data, isPending, isError, error, refetch } =
        useUncategorizedRows(open);
    const [guesses, setGuesses] = useState<Record<string, string>>({});
    const [guessing, setGuessing] = useState(false);
    const [applying, setApplying] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (!open) return;
        setGuesses({});
        setMessage("");
    }, [open]);

    const rows = data ?? [];

    const guess = async () => {
        if (!configured) {
            openSettings();
            return;
        }
        if (rows.length === 0) return;

        setGuessing(true);
        setMessage("");
        try {
            const names = [...new Set(rows.map((row) => row.itemName))];
            const result = await chatJSON<GuessResponse>(
                settings,
                categoryGuessMessages(names, CATEGORY_OPTIONS),
            );
            const byName = new Map<string, string>();
            for (const item of result.items ?? []) {
                if (
                    typeof item.name === "string" &&
                    typeof item.category === "string" &&
                    ALLOWED.has(item.category)
                ) {
                    byName.set(item.name.trim(), item.category);
                }
            }

            const next: Record<string, string> = {};
            for (const row of rows) {
                // 没猜到的留空，等用户自己选，不默认写成「其他」。
                next[row.id] = byName.get(row.itemName.trim()) ?? "";
            }
            setGuesses(next);
        } catch (err) {
            setMessage(aiErrorText(err));
        } finally {
            setGuessing(false);
        }
    };

    const runUpdates = async (
        updates: CategoryUpdate[],
    ): Promise<ApplySummary> => {
        let done = 0;
        const failures: string[] = [];
        for (let start = 0; start < updates.length; start += APPLY_BATCH_SIZE) {
            const slice = updates.slice(start, start + APPLY_BATCH_SIZE);
            const results = await Promise.allSettled(
                slice.map((item) =>
                    pb.collection("ji_zhang_biao").update(item.id, {
                        category: item.category,
                    }),
                ),
            );
            results.forEach((result, index) => {
                if (result.status === "fulfilled") {
                    done += 1;
                } else {
                    failures.push(
                        `${slice[index].itemName}：${pbErrorText(result.reason)}`,
                    );
                }
            });
            // 权限或网络的问题不会因为多试几批就好了，停下来别一直刷。
            if (failures.length > 0) break;
        }
        return { done, failures };
    };

    const apply = async () => {
        const updates: CategoryUpdate[] = rows
            .filter((row) => guesses[row.id])
            .map((row) => ({
                id: row.id,
                itemName: row.itemName,
                category: guesses[row.id],
            }));
        if (updates.length === 0 || applying) return;

        setApplying(true);
        setMessage("");
        try {
            const summary = await toastPromise(runUpdates(updates), {
                loading: `补 ${updates.length} 笔分类中...`,
                success: ({ done, failures }) =>
                    failures.length === 0
                        ? `补好了 ${done} 笔`
                        : `补好了 ${done} 笔，${failures.length} 笔失败`,
                error: (err) => `补分类失败：${pbErrorText(err)}`,
            });
            await queryClient.invalidateQueries({
                queryKey: qk.jiZhang.all,
            });
            if (summary.failures.length === 0) {
                onClose();
            } else {
                setMessage(summary.failures.slice(0, 3).join("\n"));
            }
        } catch {
            // toastPromise 已经提示过
        } finally {
            setApplying(false);
        }
    };

    const guessedCount = rows.filter((row) => guesses[row.id]).length;

    return (
        <AiSheet
            open={open}
            onClose={onClose}
            title="补全历史分类"
            subtitle="只改分类，不动金额和项目名"
        >
            <div className="space-y-3 pb-2">
                {isPending ? (
                    <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-6 text-sm text-muted-foreground">
                        <LoadingSpinner size={16} />
                        找找还有哪些没分类...
                    </div>
                ) : isError ? (
                    <div className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-6 text-amber-800">
                        {error.message}
                        <button
                            type="button"
                            className="ml-1 font-semibold underline"
                            onClick={() => void refetch()}
                        >
                            重试
                        </button>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/70 px-4 py-10 text-center">
                        <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                            <Check className="size-5" />
                        </span>
                        <p className="mt-3 text-sm font-semibold">都分好类了</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            没有需要补的历史账目。
                        </p>
                    </div>
                ) : (
                    <>
                        <p className="text-[12.5px] text-muted-foreground">
                            有 {rows.length} 笔历史账目还没有分类，AI
                            会按项目名猜一个。
                        </p>

                        <ul className="max-h-72 space-y-1.5 overflow-y-auto overscroll-contain">
                            {rows.map((row) => {
                                const value = guesses[row.id] ?? "";
                                const category = getExpenseCategory(value);
                                return (
                                    <li
                                        key={row.id}
                                        className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-2.5 py-2"
                                    >
                                        <span
                                            className={`grid size-7 shrink-0 place-items-center rounded-full ${category.tone}`}
                                        >
                                            <Tags
                                                className="size-3.5"
                                                aria-hidden="true"
                                            />
                                        </span>
                                        <span className="min-w-0 flex-1 truncate text-sm">
                                            {row.itemName}
                                        </span>
                                        <select
                                            value={value}
                                            aria-label={`${row.itemName} 的分类`}
                                            onChange={(event) =>
                                                setGuesses((previous) => ({
                                                    ...previous,
                                                    [row.id]:
                                                        event.target.value,
                                                }))
                                            }
                                            className="h-8 shrink-0 rounded-lg border border-border/70 bg-background px-2 text-xs"
                                        >
                                            <option value="">未分类</option>
                                            {CATEGORY_OPTIONS.map((option) => (
                                                <option
                                                    key={option.value}
                                                    value={option.value}
                                                >
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}

                {message && (
                    <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-6 text-amber-800">
                        {message}
                    </p>
                )}

                {rows.length > 0 && (
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="flex-1"
                            onClick={guess}
                            disabled={guessing || applying}
                        >
                            {guessing ? (
                                <LoadingSpinner size={16} />
                            ) : (
                                <Tags className="mr-1 size-4" />
                            )}
                            {guessedCount > 0 ? "重新猜" : "让 AI 猜分类"}
                        </Button>
                        <LoadingButton
                            type="button"
                            className="flex-1"
                            loading={applying}
                            onClick={apply}
                            disabled={guessedCount === 0 || guessing}
                        >
                            应用（{guessedCount}）
                        </LoadingButton>
                    </div>
                )}
            </div>
        </AiSheet>
    );
}
