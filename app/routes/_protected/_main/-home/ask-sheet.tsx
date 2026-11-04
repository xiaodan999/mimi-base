import { useEffect, useRef, useState } from "react";
import { startOfMonth } from "date-fns/esm";
import { Send, Sparkles } from "lucide-react";

import { useAi } from "@/app/ai/AiContext";
import AiMarkdown from "@/app/ai/AiMarkdown";
import AiSheet from "@/app/ai/AiSheet";
import { aiErrorText, streamChat } from "@/app/ai/client";
import { askMessages } from "@/app/ai/home";
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
    const user = useCurrentUser();
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (open) return;
        abortRef.current?.abort();
        setQuestion("");
        setAnswer("");
        setError("");
        setLoading(false);
    }, [open]);

    useEffect(() => () => abortRef.current?.abort(), []);

    const ask = async (preset?: string) => {
        const value = (preset ?? question).trim();
        if (!value) return;
        if (!configured) {
            openSettings();
            return;
        }

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setQuestion(value);
        setAnswer("");
        setError("");
        setLoading(true);

        try {
            const context = await buildContext(streak, user.id);
            if (controller.signal.aborted) return;

            let text = "";
            for await (const delta of streamChat(
                settings,
                askMessages({ question: value, context }),
                controller.signal,
            )) {
                text += delta;
                setAnswer(text);
            }
        } catch (err) {
            if (!controller.signal.aborted) setError(aiErrorText(err));
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            setLoading(false);
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
