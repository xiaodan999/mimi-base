import { Sparkles } from "lucide-react";
import { useMemo } from "react";

import { useAi } from "@/app/ai/AiContext";
import { hashText } from "@/app/ai/cache";
import { AiError, chatText } from "@/app/ai/client";
import { useAiFeature } from "@/app/ai/use-ai-feature";
import { reportLetterMessages } from "@/app/report/ai";
import type { YearReport } from "@/app/report/data";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useCurrentUser } from "@/lib/auth";

export default function ReportLetter({
    year,
    report,
    study,
}: {
    year: number;
    report: Omit<YearReport, "year" | "study">;
    study: {
        questions: number;
        correct: number;
        streak: number;
        xp: number;
    };
}) {
    const user = useCurrentUser();
    const { settings } = useAi();

    const top = report.expenses.categories[0];
    const input = useMemo(
        () => ({
            year,
            posts: report.posts.total,
            photos: report.posts.photos,
            spend: report.expenses.total,
            entries: report.expenses.count,
            topCategory: top?.label ?? "其他",
            topCategoryShare:
                report.expenses.total > 0
                    ? (top?.total ?? 0) / report.expenses.total
                    : 0,
            questions: study.questions,
            correct: study.correct,
            streak: study.streak,
            xp: study.xp,
        }),
        [report, study, top, year],
    );
    const key = `report-letter:${user.id}:${year}:${hashText(
        JSON.stringify(input),
    )}`;
    const empty =
        report.posts.total === 0 &&
        report.expenses.count === 0 &&
        study.questions === 0;

    const messages = useMemo(() => reportLetterMessages(input), [input]);

    // 打开 / 换 key 时统一决策：永远先看缓存（移除旧的 nonce===0 gate），
    // 之后即使某次重新写失败，好缓存也不会被藏起来（keepCacheOnError）。
    const feature = useAiFeature<string>({
        key,
        title: "年度小结",
        subtitle: `${year} 年的这一页`,
        href: "/report",
        kind: "text",
        enabled: !empty,
        hasValue: (value) => value.trim().length > 0,
        keepCacheOnError: true,
        resume: { messages },
        run: async ({ signal }) => {
            const text = await chatText(settings, messages, signal);
            const trimmed = text.trim();
            if (!trimmed) {
                throw new AiError("AI 没写出内容，再试一次");
            }
            return trimmed;
        },
    });
    const letter = feature.value ?? "";
    const loading = feature.running;
    const error = feature.error;

    return (
        <section className="mt-3 rounded-2xl border border-primary/25 bg-primary/[0.05] p-4 shadow-soft">
            <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-full bg-primary/15 text-primary">
                    <Sparkles className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold">写给你的一页</h2>
                    <p className="text-[11px] text-muted-foreground">
                        根据这一年的数字生成
                    </p>
                </div>
                {!empty && !loading && (
                    <button
                        type="button"
                        className="text-[11px] font-semibold text-primary"
                        onClick={() => void feature.start({ force: true })}
                    >
                        重新写
                    </button>
                )}
            </div>

            {empty ? (
                <EmptyState
                    bare
                    className="mt-3 items-start text-left"
                    description="这一年还没有记录。先去发一条动态、记一笔账，明年再回来看看。"
                    descriptionClassName="leading-6"
                />
            ) : loading ? (
                <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <LoadingSpinner size={14} />
                    正在翻这一年的记录...
                </p>
            ) : error ? (
                <p className="mt-3 text-xs leading-6 text-amber-700">{error}</p>
            ) : (
                <p className="mt-3 text-[13px] leading-6 whitespace-pre-line">
                    {letter}
                </p>
            )}
        </section>
    );
}
