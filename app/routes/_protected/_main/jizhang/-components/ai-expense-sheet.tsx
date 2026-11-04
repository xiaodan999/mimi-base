import { useEffect, useState } from "react";
import { Camera, Sparkles, Trash2, Wand2 } from "lucide-react";

import { useAi } from "@/app/ai/AiContext";
import AiSheet from "@/app/ai/AiSheet";
import { aiErrorText, chatJSON, type AiMessage } from "@/app/ai/client";
import { expenseReceiptMessages, expenseTextMessages } from "@/app/ai/expense";
import { imageToDataUrl } from "@/app/ai/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Textarea } from "@/components/ui/textarea";
import showFilePicker from "@/lib/showFilePicker";
import { toastPromise } from "@/lib/toast-promise";

import { EXPENSE_CATEGORIES, getExpenseCategory } from "../-categories";
import { useAddJiZhang } from "../-data";

type DraftRow = {
    key: number;
    name: string;
    price: string;
    category: string;
};

type RawParsed = {
    items?: {
        name?: unknown;
        price?: unknown;
        category?: unknown;
    }[];
};

const CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map(({ value, label }) => ({
    value,
    label,
}));
const ALLOWED = new Set<string>(CATEGORY_OPTIONS.map((item) => item.value));

function toDrafts(raw: RawParsed): DraftRow[] {
    const items = Array.isArray(raw.items) ? raw.items : [];
    return items.flatMap((item, index) => {
        const name =
            typeof item.name === "string" ? item.name.trim().slice(0, 50) : "";
        const price = Number(item.price);
        if (!name || !Number.isFinite(price) || price <= 0) return [];
        const category =
            typeof item.category === "string" && ALLOWED.has(item.category)
                ? item.category
                : "other";
        return [{ key: index, name, price: String(price), category }];
    });
}

export default function AiExpenseSheet({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    const { settings, configured, openSettings } = useAi();
    const mutation = useAddJiZhang();
    const [text, setText] = useState("");
    const [receipt, setReceipt] = useState<{
        file: File;
        url: string;
    } | null>(null);
    const [rows, setRows] = useState<DraftRow[]>([]);
    const [stage, setStage] = useState<"input" | "review">("input");
    const [loading, setLoading] = useState(false);
    const [picking, setPicking] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) return;
        // 每次打开都是新的一笔，不复用上次的草稿。
        setStage("input");
        setRows([]);
        setError("");
        setText("");
        setReceipt(null);
    }, [open]);

    useEffect(() => {
        if (!receipt) return;
        const url = receipt.url;
        return () => URL.revokeObjectURL(url);
    }, [receipt]);

    const pickReceipt = async () => {
        if (picking) return;
        setPicking(true);
        try {
            const file = await showFilePicker("image/*");
            setReceipt({ file, url: URL.createObjectURL(file) });
            setError("");
        } catch {
            // 用户取消选择
        } finally {
            setPicking(false);
        }
    };

    const parse = async () => {
        if (!configured) {
            openSettings();
            return;
        }
        if (!text.trim() && !receipt) {
            setError("说一句花了什么，或者拍张小票。");
            return;
        }

        setLoading(true);
        setError("");
        try {
            let messages: AiMessage[];
            if (receipt) {
                const imageUrl = await imageToDataUrl(receipt.file);
                messages = expenseReceiptMessages(
                    [imageUrl],
                    CATEGORY_OPTIONS,
                    text,
                );
            } else {
                messages = expenseTextMessages(text, CATEGORY_OPTIONS);
            }

            const parsed = await chatJSON<RawParsed>(settings, messages);
            const drafts = toDrafts({
                items: parsed.items?.map((item) => ({
                    name: item.name,
                    price: item.price,
                    category: item.category,
                })),
            });
            if (drafts.length === 0) {
                setError("没读懂这笔账，换个说法再试试？");
                return;
            }
            setRows(drafts);
            setStage("review");
        } catch (err) {
            setError(aiErrorText(err));
        } finally {
            setLoading(false);
        }
    };

    const validRows = rows.filter((row) => {
        const price = Number(row.price);
        return row.name.trim().length > 0 && price > 0;
    });
    const canSave = validRows.length === rows.length && rows.length > 0;

    const save = async () => {
        if (!canSave || saving) return;
        setSaving(true);
        try {
            await toastPromise(
                Promise.all(
                    rows.map((row) =>
                        mutation.mutateAsync({
                            itemName: row.name.trim(),
                            price: Number(row.price),
                            category: row.category,
                        }),
                    ),
                ),
                {
                    loading: `记录 ${rows.length} 笔中...`,
                    success: `记好了，共 ${rows.length} 笔`,
                    error: "记录失败",
                },
            );
            onClose();
        } catch {
            // toastPromise 已经提示过
        } finally {
            setSaving(false);
        }
    };

    const updateRow = (key: number, patch: Partial<DraftRow>) => {
        setRows((previous) =>
            previous.map((row) =>
                row.key === key ? { ...row, ...patch } : row,
            ),
        );
    };

    return (
        <AiSheet
            open={open}
            onClose={onClose}
            title={stage === "input" ? "AI 记账" : "确认账目"}
            subtitle={
                stage === "input"
                    ? "说一句，或者拍张小票"
                    : "改一改再记下，日期按今天算"
            }
        >
            <div className="space-y-3 pb-2">
                {!configured && (
                    <div className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-6 text-amber-800">
                        还没配置 AI。
                        <button
                            type="button"
                            className="ml-1 font-semibold underline"
                            onClick={openSettings}
                        >
                            去设置
                        </button>
                    </div>
                )}

                {stage === "input" ? (
                    <>
                        <Textarea
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                            aria-label="这笔账的描述"
                            placeholder="比如：午饭 25，打车 18，奶茶 12"
                            className="min-h-24 resize-none text-[15px]"
                            disabled={loading}
                        />

                        {receipt ? (
                            <div className="relative overflow-hidden rounded-2xl border border-border/60">
                                <img
                                    src={receipt.url}
                                    alt="待识别的小票"
                                    className="max-h-56 w-full bg-muted/40 object-contain"
                                />
                                <button
                                    type="button"
                                    onClick={() => setReceipt(null)}
                                    aria-label="移除小票"
                                    className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/55 text-white"
                                >
                                    <Trash2 className="size-4" />
                                </button>
                            </div>
                        ) : (
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full justify-start gap-2"
                                onClick={pickReceipt}
                                disabled={picking || loading}
                            >
                                {picking ? (
                                    <LoadingSpinner size={16} />
                                ) : (
                                    <Camera className="size-4" />
                                )}
                                拍张小票，让 AI 自己填
                            </Button>
                        )}

                        {error && (
                            <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-6 text-amber-800">
                                {error}
                            </p>
                        )}

                        <LoadingButton
                            type="button"
                            loading={loading}
                            className="w-full"
                            onClick={parse}
                            disabled={picking}
                        >
                            <Sparkles className="mr-1 size-4" />
                            {receipt ? "识别小票" : "让 AI 记一下"}
                        </LoadingButton>
                    </>
                ) : (
                    <>
                        <ul className="space-y-2">
                            {rows.map((row) => {
                                const category = getExpenseCategory(
                                    row.category,
                                );
                                const CategoryIcon = category.icon;
                                return (
                                    <li
                                        key={row.key}
                                        className="rounded-2xl border border-border/60 bg-card p-2.5"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`grid size-8 shrink-0 place-items-center rounded-full ${category.tone}`}
                                            >
                                                <CategoryIcon
                                                    className="size-4"
                                                    aria-hidden="true"
                                                />
                                            </span>
                                            <Input
                                                value={row.name}
                                                aria-label="项目名"
                                                className="h-8 min-w-0 flex-1"
                                                onChange={(event) =>
                                                    updateRow(row.key, {
                                                        name: event.target
                                                            .value,
                                                    })
                                                }
                                            />
                                            <Input
                                                value={row.price}
                                                aria-label="金额"
                                                type="number"
                                                step="0.01"
                                                inputMode="decimal"
                                                className="h-8 w-20 shrink-0 text-right tabular-nums"
                                                onChange={(event) =>
                                                    updateRow(row.key, {
                                                        price: event.target
                                                            .value,
                                                    })
                                                }
                                            />
                                            <button
                                                type="button"
                                                aria-label={`删除 ${row.name}`}
                                                className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-destructive"
                                                onClick={() =>
                                                    setRows((previous) =>
                                                        previous.filter(
                                                            (item) =>
                                                                item.key !==
                                                                row.key,
                                                        ),
                                                    )
                                                }
                                            >
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        </div>
                                        <select
                                            value={row.category}
                                            aria-label={`${row.name} 的分类`}
                                            onChange={(event) =>
                                                updateRow(row.key, {
                                                    category:
                                                        event.target.value,
                                                })
                                            }
                                            className="mt-2 h-8 w-full rounded-lg border border-border/70 bg-background px-2 text-xs"
                                        >
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

                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="flex-1"
                                onClick={() => setStage("input")}
                                disabled={saving}
                            >
                                <Wand2 className="mr-1 size-4" />
                                重新描述
                            </Button>
                            <LoadingButton
                                type="button"
                                loading={saving}
                                className="flex-1"
                                onClick={save}
                                disabled={!canSave}
                            >
                                全部记下（{rows.length}）
                            </LoadingButton>
                        </div>
                    </>
                )}

                <p className="pt-1 text-center text-[10px] text-muted-foreground">
                    AI 只负责拆分，记不记由你确认
                </p>
            </div>
        </AiSheet>
    );
}
