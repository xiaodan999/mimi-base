import { useEffect, useMemo, useRef, useState } from "react";
import {
    Camera,
    ChevronRight,
    RefreshCw,
    Sparkles,
    Trash2,
    Wand2,
} from "lucide-react";

import { useAi } from "@/app/ai/AiContext";
import AiSheet from "@/app/ai/AiSheet";
import { hashText, readAiCache, removeAiCache } from "@/app/ai/cache";
import {
    AiError,
    aiErrorText,
    chatJSON,
    isAiCanceled,
    throwIfAborted,
    type AiMessage,
} from "@/app/ai/client";
import { expenseReceiptMessages, expenseTextMessages } from "@/app/ai/expense";
import { imageToDataUrl } from "@/app/ai/image";
import { decideAiRestore } from "@/app/ai/restore";
import { useAiTasks } from "@/app/ai/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Textarea } from "@/components/ui/textarea";
import showFilePicker from "@/lib/showFilePicker";
import { toastPromise } from "@/lib/toast-promise";

import { normalizeCategoryValue, type ExpenseCategory } from "../-categories";
import { useAddJiZhang, useExpenseCategories } from "../-data";

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

function toDrafts(raw: RawParsed, categories: ExpenseCategory[]): DraftRow[] {
    const items = Array.isArray(raw.items) ? raw.items : [];
    return items.flatMap((item, index) => {
        const name =
            typeof item.name === "string" ? item.name.trim().slice(0, 50) : "";
        const price = Number(item.price);
        if (!name || !Number.isFinite(price) || price <= 0) return [];
        const category =
            typeof item.category === "string"
                ? normalizeCategoryValue(item.category, categories) || "other"
                : "other";
        return [{ key: index, name, price: String(price), category }];
    });
}

/**
 * 最近一笔解析的 key。任务中心里的「去查看」会跳到 /jizhang，组件重新挂载
 * 后 ref 就没了；把它记在 sessionStorage 里，重新打开面板还能接回这笔草稿。
 */
const LAST_PARSE_KEY = "mimi:expense-parse:last";

function readLastParseKey(): string | null {
    try {
        return sessionStorage.getItem(LAST_PARSE_KEY);
    } catch {
        return null;
    }
}

function writeLastParseKey(key: string | null): void {
    try {
        if (key) sessionStorage.setItem(LAST_PARSE_KEY, key);
        else sessionStorage.removeItem(LAST_PARSE_KEY);
    } catch {
        // 隐私模式下忽略
    }
}

export default function AiExpenseSheet({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    const { settings } = useAi();
    const { runTask, attend, find, getResult } = useAiTasks();
    const mutation = useAddJiZhang();
    const { categories, getCategory } = useExpenseCategories();
    const categoryOptions = useMemo(
        () => categories.map(({ value, label }) => ({ value, label })),
        [categories],
    );
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
    // Set synchronously in parse(), not from a `loading` effect: the user can
    // dismiss the sheet before that effect runs, and then the in-flight draft
    // would be reset on the next open.
    const parsingRef = useRef(false);
    const backgroundRef = useRef(false);
    /** 当前这笔解析的任务 key，关掉再打开时据此接回后台任务/结果。 */
    const activeKeyRef = useRef<string | null>(null);
    /** rows 属于哪一次解析；换了描述后旧 rows 不能被当成新结果。 */
    const rowsKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (!open) {
            // 关着的时候还在解析，就保留这一笔，重新打开还能直接保存。
            if (parsingRef.current) backgroundRef.current = true;
            return;
        }
        // 同一页内关掉再打开走 ref；从任务中心「去查看」跳过来时组件已重建，
        // 用 sessionStorage 里记住的 key 接回那一笔。
        const key = activeKeyRef.current ?? readLastParseKey();
        // 统一决策：running 优先，再 local 草稿 → store result → 缓存。
        // local 只在「这批 rows 确实是这个 key 的结果」时才算数，否则一次失败
        // 的重新解析会把上一次的行当成结果展示出来，还把错误清掉。
        const decision = key
            ? decideAiRestore<DraftRow[]>({
                  task: find(key),
                  local: rowsKeyRef.current === key ? rows : undefined,
                  result: getResult<DraftRow[]>(key),
                  cached: readAiCache<DraftRow[]>(key),
                  hasValue: (value) => value.length > 0,
              })
            : ({ kind: "none" } as const);
        switch (decision.kind) {
            case "running":
                backgroundRef.current = false;
                setStage("input");
                return; // loading 由仍在跑的 parse() 持有
            case "ready":
                backgroundRef.current = false;
                activeKeyRef.current = key ?? null;
                rowsKeyRef.current = key ?? null;
                setRows(decision.value);
                setStage("review");
                setError("");
                return;
            case "error":
                backgroundRef.current = false;
                activeKeyRef.current = key ?? null;
                setError(decision.message);
                return;
            case "canceled":
            case "none":
                backgroundRef.current = false;
                activeKeyRef.current = null;
                rowsKeyRef.current = null;
                writeLastParseKey(null);
                setStage("input");
                setRows([]);
                setError("");
                setText("");
                setReceipt(null);
                return;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open) return;
        return attend("expense-parse");
    }, [open, attend]);

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
        if (!text.trim() && !receipt) {
            setError("说一句花了什么，或者拍张小票。");
            return;
        }

        const receiptKey = receipt
            ? `${receipt.file.name}:${receipt.file.size}:${receipt.file.lastModified}`
            : "";
        const key = `expense-parse:${hashText(`${text.trim()}|${receiptKey}`)}`;

        activeKeyRef.current = key;
        writeLastParseKey(key);
        parsingRef.current = true;
        setLoading(true);
        setError("");
        try {
            const drafts = await runTask<DraftRow[]>({
                key,
                group: "expense-parse",
                cacheKey: key,
                title: "AI 记账",
                subtitle: text.trim().slice(0, 30) || receipt?.file.name,
                href: "/jizhang",
                kind: "json",
                summarize: (value) => `识别到 ${value.length} 笔`,
                run: async ({ signal }) => {
                    let messages: AiMessage[];
                    if (receipt) {
                        const imageUrl = await imageToDataUrl(receipt.file);
                        throwIfAborted(signal);
                        messages = expenseReceiptMessages(
                            [imageUrl],
                            categoryOptions,
                            text,
                        );
                    } else {
                        messages = expenseTextMessages(text, categoryOptions);
                    }

                    const parsed = await chatJSON<RawParsed>(
                        settings,
                        messages,
                        signal,
                    );
                    const next = toDrafts(
                        {
                            items: parsed.items?.map((item) => ({
                                name: item.name,
                                price: item.price,
                                category: item.category,
                            })),
                        },
                        categories,
                    );
                    if (next.length === 0) {
                        throw new AiError("没读懂这笔账，换个说法再试试？");
                    }
                    return next;
                },
            });
            rowsKeyRef.current = key;
            setRows(drafts);
            setStage("review");
        } catch (err) {
            if (!isAiCanceled(err)) setError(aiErrorText(err));
        } finally {
            parsingRef.current = false;
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
            // 记完就丢掉这一笔的草稿/缓存，下次打开是全新的一笔。
            if (activeKeyRef.current) removeAiCache(activeKeyRef.current);
            activeKeyRef.current = null;
            rowsKeyRef.current = null;
            writeLastParseKey(null);
            setRows([]);
            setStage("input");
            setText("");
            setReceipt(null);
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
                                <div className="absolute inset-x-2 top-2 flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={pickReceipt}
                                        disabled={picking || loading}
                                        className="flex h-8 items-center gap-1.5 rounded-full bg-black/55 px-3 text-[12px] font-medium text-white backdrop-blur-sm"
                                    >
                                        <RefreshCw className="size-3.5" />
                                        重拍
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setReceipt(null)}
                                        aria-label="移除小票"
                                        className="grid size-8 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm"
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={pickReceipt}
                                disabled={picking || loading}
                                className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-3 py-3 text-left transition-colors hover:bg-primary/10 active:bg-primary/15 disabled:opacity-60"
                            >
                                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                                    {picking ? (
                                        <LoadingSpinner size={18} />
                                    ) : (
                                        <Camera className="size-5" />
                                    )}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold text-foreground">
                                        拍张小票
                                    </span>
                                    <span className="block text-[11.5px] leading-5 text-muted-foreground">
                                        AI 自动读出金额和分类，不用手打
                                    </span>
                                </span>
                                <ChevronRight
                                    className="size-4 shrink-0 text-muted-foreground"
                                    aria-hidden="true"
                                />
                            </button>
                        )}

                        {error && (
                            <p className="rounded-xl border border-warning/25 bg-warning/10 px-3 py-2 text-[12.5px] leading-6 text-foreground">
                                {error}
                            </p>
                        )}

                        <LoadingButton
                            type="button"
                            loading={loading}
                            className="h-12 w-full gap-1.5 rounded-xl text-[15px] font-semibold"
                            onClick={parse}
                            disabled={picking}
                        >
                            <Sparkles className="size-4" />
                            {receipt ? "识别这张小票" : "让 AI 记一下"}
                        </LoadingButton>
                    </>
                ) : (
                    <>
                        <ul className="space-y-2">
                            {rows.map((row) => {
                                const category = getCategory(row.category);
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
                                            {categoryOptions.map((option) => (
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
