import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { buildStudyReport, useYearReport } from "@/app/report/data";
import { useStudySummaries } from "@/app/study/progress";
import { ErrorState } from "@/components/ErrorState";
import PageHeader from "@/components/PageHeader";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { formatMoney } from "@/lib/money";

import MonthlyBars from "./-components/monthly-bars";
import ReportLetter from "./-components/report-letter";
import StatTile from "./-components/stat-tile";
import TopPostRow from "./-components/top-posts";

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
        <div className="mx-auto w-full max-w-4xl px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-10 lg:pt-8">
            <PageHeader
                backTo="/home"
                backLabel="返回首页"
                title="年度报告"
                description={`${year} · 这一年，基地替你记住了这些。`}
            />

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
                    <div className="mt-4 grid grid-cols-3 gap-2">
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
                                                <span className="text-muted-foreground tabular-nums">
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
                                    <span className="text-muted-foreground tabular-nums">
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
