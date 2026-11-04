import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

import { useAi } from "@/app/ai/AiContext";
import AiSheet from "@/app/ai/AiSheet";
import { hashText, readAiCache } from "@/app/ai/cache";
import { aiErrorText, chatJSON, isAiCanceled } from "@/app/ai/client";
import { categoryGuessMessages } from "@/app/ai/expense";
import { useAiTasks } from "@/app/ai/tasks";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { formatMoney } from "@/lib/money";
import { toastPromise } from "@/lib/toast-promise";

import { normalizeCategoryValue } from "../-categories";
import {
    useExpenseCategories,
    useUpdateJiZhang,
    type JiZhangItemData,
} from "../-data";
import CategoryChips from "./category-chips";

type GuessResponse = {
    items?: { name?: unknown; category?: unknown }[];
};

type GuessResult = {
    category: string;
    hint: string;
};

/** Fix the category of a single existing expense row. */
export default function EditExpenseSheet({
    item,
    onClose,
}: {
    item: JiZhangItemData;
    onClose: () => void;
}) {
    const { settings, configured, openSettings } = useAi();
    const { runTask, attend, tasks } = useAiTasks();
    const { categories, getCategory } = useExpenseCategories();
    const update = useUpdateJiZhang();
    const [value, setValue] = useState(item.category ?? "");
    const [hint, setHint] = useState("");
    const [guessing, setGuessing] = useState(false);
    const [saving, setSaving] = useState(false);

    const options = categories.map(({ value: optionValue, label }) => ({
        value: optionValue,
        label,
    }));
    const dirty = value !== (item.category ?? "");
    const cacheKey = `category-guess:${item.id}:${hashText(item.itemName)}`;

    // 后台猜过的结果，重新打开这一行时直接显示
    useEffect(() => {
        const cached = readAiCache<GuessResult>(cacheKey);
        if (!cached) return;
        if (cached.category) setValue(cached.category);
        setHint(cached.hint);
    }, [cacheKey]);

    // 猜分类还在后台跑时，重新打开这一行也能接上
    const activeTask = tasks.find((task) => task.key === cacheKey);
    const appliedRef = useRef<string | null>(null);
    useEffect(() => {
        if (!activeTask) return;
        if (activeTask.status === "running") {
            setGuessing(true);
            return;
        }
        if (activeTask.status === "done") {
            // 同一个结果只应用一次，别覆盖用户自己改过的分类
            if (appliedRef.current !== activeTask.id) {
                appliedRef.current = activeTask.id;
                const cached = readAiCache<GuessResult>(cacheKey);
                if (cached) {
                    if (cached.category) setValue(cached.category);
                    setHint(cached.hint);
                }
            }
            setGuessing(false);
            return;
        }
        if (activeTask.status === "error") {
            setHint(activeTask.error ?? "AI 请求失败");
            setGuessing(false);
            return;
        }
        setGuessing(false);
    }, [activeTask, cacheKey]);

    useEffect(() => {
        return attend("category-guess");
    }, [attend]);

    const guess = async () => {
        if (!configured) {
            openSettings();
            return;
        }

        setGuessing(true);
        setHint("");
        try {
            const result = await runTask<GuessResult>({
                key: cacheKey,
                group: "category-guess",
                cacheKey,
                title: "AI 猜分类",
                subtitle: item.itemName,
                kind: "json",
                summarize: (value) =>
                    value.category
                        ? `猜成「${getCategory(value.category).label}」`
                        : "没猜出来",
                run: async ({ signal }) => {
                    const response = await chatJSON<GuessResponse>(
                        settings,
                        categoryGuessMessages([item.itemName], options),
                        signal,
                    );
                    const raw = response.items?.find(
                        (entry) => typeof entry.category === "string",
                    )?.category;
                    const category =
                        typeof raw === "string"
                            ? normalizeCategoryValue(raw, categories)
                            : "";

                    return {
                        category,
                        hint: category
                            ? `AI 觉得是「${
                                  getCategory(category).label
                              }」，不对就自己换一个。`
                            : "AI 也拿不准，你直接选一个吧。",
                    };
                },
            });

            if (result.category) setValue(result.category);
            setHint(result.hint);
        } catch (err) {
            if (!isAiCanceled(err)) setHint(aiErrorText(err));
        } finally {
            setGuessing(false);
        }
    };

    const save = async () => {
        if (!dirty || saving) return;

        setSaving(true);
        try {
            await toastPromise(
                update.mutateAsync({ id: item.id, category: value }),
                {
                    loading: "改分类中...",
                    success: "分类改好了",
                    error: "修改失败",
                },
            );
            onClose();
        } catch {
            // toastPromise 已经提示过
        } finally {
            setSaving(false);
        }
    };

    return (
        <AiSheet
            open
            onClose={onClose}
            title="改一下分类"
            subtitle={`${item.itemName} · ${formatMoney(item.price)}`}
        >
            <div className="space-y-3 pb-2">
                <CategoryChips
                    categories={categories}
                    value={value}
                    onChange={setValue}
                    disabled={saving}
                />

                <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-1.5"
                    disabled={guessing || saving}
                    onClick={() => void guess()}
                >
                    {guessing ? (
                        <LoadingSpinner size={16} />
                    ) : (
                        <Sparkles className="size-4" aria-hidden="true" />
                    )}
                    让 AI 选分类
                </Button>

                {hint && (
                    <p className="rounded-xl bg-muted/50 px-3 py-2 text-[12.5px] leading-6 text-muted-foreground">
                        {hint}
                    </p>
                )}

                <LoadingButton
                    type="button"
                    className="w-full"
                    loading={saving}
                    disabled={!dirty}
                    onClick={() => void save()}
                >
                    保存
                </LoadingButton>
            </div>
        </AiSheet>
    );
}
