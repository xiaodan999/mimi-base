import { useState } from "react";
import { Sparkles } from "lucide-react";

import { useAi } from "@/app/ai/AiContext";
import AiSheet from "@/app/ai/AiSheet";
import { aiErrorText, chatJSON } from "@/app/ai/client";
import { categoryGuessMessages } from "@/app/ai/expense";
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

/** Fix the category of a single existing expense row. */
export default function EditExpenseSheet({
    item,
    onClose,
}: {
    item: JiZhangItemData;
    onClose: () => void;
}) {
    const { settings, configured, openSettings } = useAi();
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

    const guess = async () => {
        if (!configured) {
            openSettings();
            return;
        }

        setGuessing(true);
        setHint("");
        try {
            const result = await chatJSON<GuessResponse>(
                settings,
                categoryGuessMessages([item.itemName], options),
            );
            const raw = result.items?.find(
                (entry) => typeof entry.category === "string",
            )?.category;
            const next =
                typeof raw === "string"
                    ? normalizeCategoryValue(raw, categories)
                    : "";

            if (next) {
                setValue(next);
                setHint(
                    `AI 觉得是「${getCategory(next).label}」，不对就自己换一个。`,
                );
            } else {
                setHint("AI 也拿不准，你直接选一个吧。");
            }
        } catch (err) {
            setHint(aiErrorText(err));
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
