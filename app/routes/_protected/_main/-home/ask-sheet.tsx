import { useEffect, useRef, useState } from "react";
import { startOfMonth } from "date-fns/esm";
import { Send, Sparkles } from "lucide-react";

import { useAi } from "@/app/ai/AiContext";
import AiMarkdown from "@/app/ai/AiMarkdown";
import AiSheet from "@/app/ai/AiSheet";
import { hashText, readAiCache } from "@/app/ai/cache";
import {
    aiErrorText,
    isAiCanceled,
    streamChat,
    throwIfAborted,
} from "@/app/ai/client";
import { askMessages } from "@/app/ai/home";
import { decideAiRestore } from "@/app/ai/restore";
import { useAiTasks } from "@/app/ai/tasks";
import {
    categoryFromRecord,
    getExpenseCategory,
    type ExpenseCategoryRecord,
} from "@/app/routes/_protected/_main/jizhang/-categories";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/lib/auth";
import pb, { pbDate } from "@/lib/pb";

const CHIPS = [
    "这个月外卖花了多少？",
    "最近都在记录什么？",
    "本月哪类花得最多？",
];

type PostRecord = { text: string; created: string };
type ExpenseRecord = {
    item_name: string;
    price: number;
    created: string;
    category?: string;
};

/**
 * 只抓最近的一小段数据作为上下文，问题本身决定去向；
 * 数据都在浏览器里，除了模型请求不会额外落库。
 */
async function buildContext(streak: number, userId: string): Promise<string> {
    const month = startOfMonth(new Date());
    const [posts, expenses, categories] = await Promise.all([
        pb.collection("posts").getList<PostRecord>(1, 20, {
            sort: "-created",
            fields: "id,text,created",
        }),
        pb.collection("ji_zhang_biao").getFullList<ExpenseRecord>({
            sort: "-created",
            filter: pb.filter("created >= {:from}", { from: pbDate(month) }),
            fields: "id,item_name,price,created,category",
        }),
        pb.collection("ji_zhang_category").getFullList<ExpenseCategoryRecord>({
            filter: pb.filter("user_id = {:userId}", { userId }),
            sort: "created",
        }),
    ]);

    const customCategories = categories.map(categoryFromRecord);

    const postLines = posts.items
        .map((post) => {
            const text = post.text.replace(/\s+/g, " ").trim().slice(0, 120);
            return text
                ? `- ${post.created.slice(0, 10)} ${text}`
                : `- ${post.created.slice(0, 10)} （纯图片）`;
        })
        .join("\n");

    const expenseLines = expenses
        .slice(0, 80)
        .map((item) => {
            const category = getExpenseCategory(
                item.category,
                customCategories,
            );
            return `- ${item.created.slice(0, 10)} ${item.item_name} ¥${item.price}（${category.label}）`;
        })
        .join("\n");

    const categoryTotals = new Map<string, number>();
    let total = 0;
    for (const item of expenses) {
        const label = getExpenseCategory(item.category, customCategories).label;
        categoryTotals.set(
            label,
            (categoryTotals.get(label) ?? 0) + item.price,
        );
        total += item.price;
    }
    const categoryLines = [...categoryTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, sum]) => `- ${label}：¥${sum.toFixed(2)}`)
        .join("\n");

    return [
        "最近动态（最新 20 条）：",
        postLines || "（没有动态）",
        "",
        `本月账目：共 ${expenses.length} 笔，合计 ¥${total.toFixed(2)}${
            expenses.length > 80 ? "（下面只列最近 80 笔）" : ""
        }`,
        expenseLines || "（本月没有账目）",
        categoryTotals.size > 0 ? `分类小计：\n${categoryLines}` : "",
        "",
        `学习：连续学习 ${streak} 天。`,
    ]
        .filter((part) => part !== "")
        .join("\n");
}

export default function AskSheet({
    open,
    onClose,
    streak,
}: {
    open: boolean;
    onClose: () => void;
    streak: number;
}) {
    const { settings, configured, openSettings } = useAi();
    const { runTask, cancel, attend, find, getResult, tasks } = useAiTasks();
    const user = useCurrentUser();
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const activeKeyRef = useRef<string | null>(null);
    const requestRef = useRef(0);
    const group = `ask:${user.id}`;

    // 面板开着时任务完成不用再弹通知
    useEffect(() => {
        if (!open) return;
        return attend(group);
    }, [open, group, attend]);

    // 关掉再打开（或切页面回来）时用统一决策接回上一次的回答 / 后台任务
    const activeTask = tasks.find((task) => task.key === activeKeyRef.current);
    useEffect(() => {
        if (!open) return;
        const key = activeKeyRef.current;
        const decision = decideAiRestore<string>({
            task: activeTask ?? (key ? find(key) : undefined),
            local: answer,
            result: key ? getResult<string>(key) : undefined,
            cached: key ? readAiCache<string>(key) : undefined,
            hasValue: (value) => value.trim().length > 0,
        });
        switch (decision.kind) {
            case "ready":
                setAnswer(decision.value);
                setError("");
                setLoading(false);
                break;
            case "running":
                setLoading(true);
                setError("");
                break;
            case "error":
                setError(decision.message);
                setLoading(false);
                break;
            case "canceled":
            case "none":
                setLoading(false);
                break;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, activeTask]);

    const ask = async (preset?: string) => {
        const value = (preset ?? question).trim();
        if (!value) return;
        if (!configured) {
            openSettings();
            return;
        }

        const key = `${group}:${hashText(value)}`;
        if (activeKeyRef.current && activeKeyRef.current !== key) {
            cancel(activeKeyRef.current);
        }
        activeKeyRef.current = key;
        const ticket = ++requestRef.current;

        setQuestion(value);
        setAnswer("");
        setError("");
        setLoading(true);

        try {
            const text = await runTask<string>({
                key,
                group,
                cacheKey: key,
                title: "问问我的基地",
                subtitle: value,
                href: "/home",
                kind: "stream",
                summarize: () => "回答已生成",
                run: async ({ signal, report }) => {
                    const context = await buildContext(streak, user.id);
                    throwIfAborted(signal);

                    let text = "";
                    for await (const delta of streamChat(
                        settings,
                        askMessages({ question: value, context }),
                        signal,
                    )) {
                        text += delta;
                        report(text);
                        if (requestRef.current !== ticket) break;
                        setAnswer(text);
                    }
                    return text;
                },
            });
            if (requestRef.current === ticket) setAnswer(text);
        } catch (err) {
            if (requestRef.current !== ticket) return;
            if (!isAiCanceled(err)) setError(aiErrorText(err));
        } finally {
            if (requestRef.current === ticket) setLoading(false);
        }
    };

    return (
        <AiSheet
            open={open}
            onClose={onClose}
            title="问问我的基地"
            subtitle="只看你自己的记录，不联网搜索"
        >
            <div className="space-y-3 pb-2">
                <Textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    aria-label="问基地一个问题"
                    placeholder="比如：这个月外卖花了多少？"
                    className="min-h-20 resize-none text-[15px]"
                    disabled={loading}
                />

                <Button
                    type="button"
                    className="w-full gap-1.5"
                    onClick={() => ask()}
                    disabled={loading || !question.trim()}
                >
                    {loading ? (
                        <LoadingSpinner size={16} />
                    ) : (
                        <Send className="size-4" />
                    )}
                    问一下
                </Button>

                {!answer && !error && !loading && (
                    <div className="flex flex-wrap gap-2">
                        {CHIPS.map((chip) => (
                            <button
                                key={chip}
                                type="button"
                                className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                                onClick={() => void ask(chip)}
                            >
                                {chip}
                            </button>
                        ))}
                    </div>
                )}

                {(answer || (loading && !answer)) && (
                    <div className="rounded-2xl bg-muted/60 px-3 py-2">
                        {answer ? (
                            <AiMarkdown text={answer} />
                        ) : (
                            <span className="flex items-center gap-2 text-sm text-muted-foreground">
                                <LoadingSpinner size={14} />
                                正在翻你的记录...
                            </span>
                        )}
                    </div>
                )}

                {error && (
                    <div className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-6 text-amber-800">
                        {error}
                        <button
                            type="button"
                            className="ml-1 font-semibold underline"
                            onClick={() => void ask()}
                        >
                            重试
                        </button>
                    </div>
                )}

                <p className="flex items-center justify-center gap-1 pt-1 text-center text-[10px] text-muted-foreground">
                    <Sparkles className="size-3" aria-hidden="true" />
                    数据只用于这一次提问
                </p>
            </div>
        </AiSheet>
    );
}
