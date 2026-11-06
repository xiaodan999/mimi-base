import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, Sparkles } from "lucide-react";

import { useAi } from "@/app/ai/AiContext";
import { hashText, readAiCache } from "@/app/ai/cache";
import { AiError, aiErrorText, chatText, isAiCanceled } from "@/app/ai/client";
import { reportLetterMessages } from "@/app/ai/report";
import { decideAiRestore } from "@/app/ai/restore";
import { useAiTasks } from "@/app/ai/tasks";
import { useStudySummaries } from "@/app/study/progress";
import { ErrorState } from "@/components/ErrorState";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { getFileUrl } from "@/lib/pb";
import { cn } from "@/lib/utils";

import { buildStudyReport, useYearReport, type TopPost } from "./-data";

export const Route = createFileRoute("/_protected/_main/report/")({
    component: Page,
});

function Page() {
    const year = new Date().getFullYear();
    const {
        data: report,
        isPending,
        isError,
        error,
        refetch,
    } = useYearReport(year);
    const { data: summaries } = useStudySummaries();
    const study = useMemo(() => buildStudyReport(summaries), [summaries]);

    return (
        <div className="px-4 pb-10 pt-[calc(1rem+env(safe-area-inset-top))]">
            <Link
                to="/home"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
                <ChevronLeft className="size-3.5" aria-hidden="true" />
                返回首页
            </Link>

            <section className="mt-3 overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-primary/15 via-card to-card p-5 shadow-soft">
                <p className="text-xs font-medium text-muted-foreground">
                    秘密基地 · 年度报告
                </p>
                <h1 className="mt-1 text-4xl font-semibold tracking-tight">
                    {year}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    这一年，基地替你记住了这些。
                </p>
            </section>

            {isPending ? (
                <div className="mt-10 flex justify-center">
                    <LoadingSpinner />
                </div>
            ) : isError || !report ? (
                <div className="mt-4">
                    <ErrorState
                        message={error?.message ?? "报告加载失败"}
                        onRetry={() => void refetch()}
                    />
                </div>
            ) : (
                <>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                        <StatTile label="动态" value={report.posts.total} />
                        <StatTile label="照片" value={report.posts.photos} />
                        <StatTile
                            label="记账"
                            value={`${report.expenses.count} 笔`}
                        />
                        <StatTile
                            label="支出"
                            value={formatMoney(report.expenses.total, true)}
                        />
                        <StatTile label="做题" value={study.questions} />
                        <StatTile
                            label="连续学习"
                            value={`${study.streak} 天`}
                        />
                    </div>

                    <ReportLetter year={year} report={report} study={study} />

                    <section className="mt-4 rounded-2xl border border-border/60 bg-card p-4 shadow-soft">
                        <h2 className="text-sm font-semibold">每月支出</h2>
                        <MonthlyBars
                            values={report.expenses.monthly}
                            format={(value) => formatMoney(value, true)}
                        />
                    </section>

                    {report.expenses.categories.length > 0 && (
                        <section className="mt-3 rounded-2xl border border-border/60 bg-card p-4 shadow-soft">
                            <h2 className="text-sm font-semibold">
                                钱都花在哪了
                            </h2>
                            <ul className="mt-3 space-y-2.5">
                                {report.expenses.categories.map((category) => {
                                    const max =
                                        report.expenses.categories[0]?.total ??
                                        1;
                                    return (
                                        <li key={category.label}>
                                            <div className="flex items-baseline justify-between text-xs">
                                                <span className="font-medium">
                                                    {category.label}
                                                </span>
                                                <span className="tabular-nums text-muted-foreground">
                                                    {formatMoney(
                                                        category.total,
                                                        true,
                                                    )}{" "}
                                                    · {category.count} 笔
                                                </span>
                                            </div>
                                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                                                <div
                                                    className="h-full rounded-full bg-primary/70"
                                                    style={{
                                                        width: `${Math.max(4, (category.total / max) * 100)}%`,
                                                    }}
                                                />
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    )}

                    {report.posts.top.length > 0 && (
                        <section className="mt-3 rounded-2xl border border-border/60 bg-card p-4 shadow-soft">
                            <h2 className="text-sm font-semibold">
                                被点赞最多的动态
                            </h2>
                            <ul className="mt-3 space-y-2.5">
                                {report.posts.top.map((post) => (
                                    <TopPostRow key={post.id} post={post} />
                                ))}
                            </ul>
                        </section>
                    )}

                    <section className="mt-3 rounded-2xl border border-border/60 bg-card p-4 shadow-soft">
                        <h2 className="text-sm font-semibold">学习基地</h2>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                            进度是累计的，这里看的是“截至目前”。
                        </p>
                        <ul className="mt-3 space-y-2">
                            {study.subjects.map((subject) => (
                                <li
                                    key={subject.title}
                                    className="flex items-center justify-between text-xs"
                                >
                                    <span className="font-medium">
                                        {subject.title}
                                    </span>
                                    <span className="tabular-nums text-muted-foreground">
                                        {subject.known}/{subject.total} 张卡
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <div className="mt-3 grid grid-cols-3 divide-x divide-border/60 border-t border-border/60 pt-3 text-center">
                            <div>
                                <p className="text-lg font-semibold tabular-nums">
                                    {study.xp}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                    经验值
                                </p>
                            </div>
                            <div>
                                <p className="text-lg font-semibold tabular-nums">
                                    {study.questions > 0
                                        ? `${Math.round(
                                              (study.correct /
                                                  study.questions) *
                                                  100,
                                          )}%`
                                        : "—"}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                    正确率
                                </p>
                            </div>
                            <div>
                                <p className="text-lg font-semibold tabular-nums">
                                    {study.streak}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                    连续天数
                                </p>
                            </div>
                        </div>
                    </section>

                    <p className="mt-6 text-center text-[10px] font-medium text-muted-foreground">
                        秘密基地 · {year}
                    </p>
                </>
            )}
        </div>
    );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-soft">
            <p className="truncate text-lg font-semibold tabular-nums">
                {value}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
        </div>
    );
}

function MonthlyBars({
    values,
    format,
}: {
    values: number[];
    format: (value: number) => string;
}) {
    const max = Math.max(1, ...values);

    return (
        <div
            role="img"
            aria-label={`每月支出：${values
                .map((value, index) => `${index + 1} 月 ${format(value)}`)
                .join("，")}`}
            className="mt-3 flex h-24 items-stretch gap-1"
        >
            {values.map((value, index) => (
                <div
                    key={index}
                    className="flex min-w-0 flex-1 flex-col items-center"
                >
                    <div className="relative w-full flex-1">
                        <div
                            aria-hidden="true"
                            className={cn(
                                "absolute inset-x-0 bottom-0 mx-auto max-w-6 rounded-t-md",
                                value > 0 ? "bg-primary/55" : "bg-muted",
                            )}
                            style={{
                                height:
                                    value > 0
                                        ? `${Math.max(8, (value / max) * 100)}%`
                                        : "3px",
                            }}
                        />
                    </div>
                    <span className="mt-1 text-[9px] text-muted-foreground">
                        {index + 1}
                    </span>
                </div>
            ))}
        </div>
    );
}

function TopPostRow({ post }: { post: TopPost }) {
    const url = post.image
        ? getFileUrl(
              {
                  id: post.id,
                  collectionId: post.collectionId,
                  collectionName: post.collectionName,
              },
              post.image,
              "400x400",
          )
        : "";

    return (
        <li className="flex items-center gap-3">
            {url ? (
                <img
                    src={url}
                    alt=""
                    className="size-14 shrink-0 rounded-xl object-cover"
                    loading="lazy"
                />
            ) : (
                <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-muted text-[10px] text-muted-foreground">
                    记录
                </span>
            )}
            <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-xs leading-5">
                    {post.text.trim() || "只有照片的一条动态"}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {post.createdAt.slice(0, 10)} · {post.likes} 赞
                </p>
            </div>
        </li>
    );
}

function ReportLetter({
    year,
    report,
    study,
}: {
    year: number;
    report: NonNullable<ReturnType<typeof useYearReport>["data"]>;
    study: ReturnType<typeof buildStudyReport>;
}) {
    const user = useCurrentUser();
    const { settings } = useAi();
    const { runTask, attend, find, getResult } = useAiTasks();
    const [letter, setLetter] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const ticketRef = useRef(0);

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

    const restoreInput = (task: ReturnType<typeof find>) => ({
        task,
        result: getResult<string>(key),
        cached: readAiCache<string>(key),
        hasValue: (value: string) => value.trim().length > 0,
    });

    const run = useCallback(
        async (force: boolean) => {
            const ticket = ++ticketRef.current;
            setLoading(true);
            setError("");
            if (force) setLetter("");
            try {
                const value = await runTask<string>({
                    key,
                    group: key,
                    cacheKey: key,
                    title: "年度小结",
                    subtitle: `${year} 年的这一页`,
                    href: "/report",
                    kind: "text",
                    force,
                    summarize: () => "写好了",
                    run: async ({ signal }) => {
                        const text = await chatText(
                            settings,
                            reportLetterMessages(input),
                            signal,
                        );
                        const trimmed = text.trim();
                        if (!trimmed) {
                            throw new AiError("AI 没写出内容，再试一次");
                        }
                        return trimmed;
                    },
                });
                if (ticketRef.current === ticket) setLetter(value);
            } catch (err) {
                if (ticketRef.current !== ticket || isAiCanceled(err)) return;
                // 重新写失败时别把之前写好的那封藏起来：缓存里的好结果优先于
                // 这次 error（restore.test.ts:84-93 保护的正是这种情形）。
                const decision = decideAiRestore<string>(
                    restoreInput(find(key)),
                );
                if (decision.kind === "ready") {
                    setLetter(decision.value);
                    setError("");
                } else {
                    setError(aiErrorText(err));
                }
            } finally {
                if (ticketRef.current === ticket) setLoading(false);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [find, getResult, input, key, runTask, settings, year],
    );

    // 打开 / 换 key 时统一决策：永远先看缓存（移除旧的 nonce===0 gate），
    // 之后即使某次重新写失败，好缓存也不会被藏起来。
    useEffect(() => {
        if (empty) return;
        const decision = decideAiRestore<string>(restoreInput(find(key)));
        if (decision.kind === "ready") {
            setLetter(decision.value);
            setError("");
            setLoading(false);
            return;
        }
        if (decision.kind === "error") {
            setError(decision.message);
            setLoading(false);
            return;
        }
        if (decision.kind === "canceled") {
            setError("已取消");
            setLoading(false);
            return;
        }
        // running / none：run() 会接上同一个任务或开一个新的
        void run(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, empty]);

    // 在报告页上看着呢，完成时就不用再弹通知了
    useEffect(() => {
        if (empty) return;
        return attend(key);
    }, [empty, key, attend]);

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
                        onClick={() => void run(true)}
                    >
                        重新写
                    </button>
                )}
            </div>

            {empty ? (
                <p className="mt-3 text-xs leading-6 text-muted-foreground">
                    这一年还没有记录。先去发一条动态、记一笔账，明年再回来看看。
                </p>
            ) : loading ? (
                <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <LoadingSpinner size={14} />
                    正在翻这一年的记录...
                </p>
            ) : error ? (
                <p className="mt-3 text-xs leading-6 text-amber-700">{error}</p>
            ) : (
                <p className="mt-3 whitespace-pre-line text-[13px] leading-6">
                    {letter}
                </p>
            )}
        </section>
    );
}
