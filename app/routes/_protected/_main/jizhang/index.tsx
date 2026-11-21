import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Settings2, Sparkles, Tags } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";

import {
    defaultJiZhangRange,
    type JiZhangItemData,
    jiZhangQueryOptions,
    useExpenseCategories,
    useJiZhang,
} from "@/app/ledger/data";
import { buildTrend, summarizeDays } from "@/app/ledger/summary";
import { ErrorState } from "@/components/ErrorState";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";

import AddJiZhangForm from "./-components/add-ji-zhang-form";
import AiCategoryFix from "./-components/ai-category-fix";
import AiExpenseReview from "./-components/ai-expense-review";
import AiExpenseSheet from "./-components/ai-expense-sheet";
import DayCard from "./-components/day-card";
import EditExpenseSheet from "./-components/edit-expense-sheet";
import { EmptyState, JiZhangSkeleton } from "./-components/list-states";
import ManageCategoriesSheet from "./-components/manage-categories-sheet";
import {
    BrokenSummary,
    SummaryCard,
    SummarySkeleton,
} from "./-components/summary-card";
import { takeSharedReceipt } from "./-shared-receipt";

type JiZhangSearch = {
    share?: string;
};

export const Route = createFileRoute("/_protected/_main/jizhang/")({
    validateSearch: (search: Record<string, unknown>): JiZhangSearch => ({
        // Web Share Target: public/sw.js answers POST /share with a 303 here.
        share: typeof search.share === "string" ? search.share : undefined,
    }),
    // Warm the opening range before the page commits. With
    // `defaultPreload: "intent"` a tap starts this loader, so the page mounts
    // with rows in the cache instead of flashing its skeleton.
    loader: async ({ context }) => {
        const { user } = await context.auth.waitForAuth();
        if (!user) return;
        try {
            await context.queryClient.ensureQueryData(
                jiZhangQueryOptions(user.id, defaultJiZhangRange()),
            );
        } catch {
            // The page renders its own error state with a retry button.
        }
    },
    component: Page,
});

function Page() {
    const navigate = useNavigate();
    const search = Route.useSearch();
    const [dateRange, setDateRange] = useState<DateRange | undefined>(
        defaultJiZhangRange,
    );
    const [aiEntryOpen, setAiEntryOpen] = useState(false);
    const [sharedReceipt, setSharedReceipt] = useState<File | null>(null);
    const handledShareRef = useRef<string | null>(null);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [fixOpen, setFixOpen] = useState(false);
    const [manageOpen, setManageOpen] = useState(false);
    const [editing, setEditing] = useState<JiZhangItemData | null>(null);
    const { data, isPending, isError, error, isRefetching, refetch } =
        useJiZhang(dateRange);
    const { getCategory } = useExpenseCategories();

    const days = useMemo(() => data ?? [], [data]);
    const from = dateRange?.from;
    const to = dateRange?.to;
    const summary = useMemo(
        () => summarizeDays(days, from, to),
        [days, from, to],
    );
    const trend = useMemo(() => buildTrend(days, from, to), [days, from, to]);

    // A Web Share Target POST lands here as `?share=<id>` (public/sw.js). The
    // image is already in Cache Storage; claim it once, then drop the one-shot
    // param so a refresh cannot replay the same share.
    useEffect(() => {
        const id = search.share;
        if (!id || handledShareRef.current === id) return;
        handledShareRef.current = id;
        void navigate({
            to: "/jizhang",
            search: {},
            replace: true,
        });
        void takeSharedReceipt(id).then((file) => {
            if (!file) {
                toast.error("分享的图片过期了，再分享一次吧");
                return;
            }
            setSharedReceipt(file);
            setAiEntryOpen(true);
        });
    }, [navigate, search.share]);

    return (
        <div className="mx-auto w-full max-w-5xl px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-8 lg:pt-8">
            <PageHeader
                title="记账基地"
                description="两个人的共享账本"
                actions={
                    <>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="AI 记账"
                            className="rounded-full"
                            onClick={() => setAiEntryOpen(true)}
                        >
                            <Sparkles className="size-4" />
                        </Button>
                        <AddJiZhangForm />
                    </>
                }
            />

            {isPending ? (
                <SummarySkeleton />
            ) : isError ? (
                <BrokenSummary date={dateRange} onRangeChange={setDateRange} />
            ) : (
                <SummaryCard
                    summary={summary}
                    trend={trend}
                    date={dateRange}
                    onRangeChange={setDateRange}
                    refreshing={isRefetching}
                />
            )}

            {!isPending && !isError && (
                <div className="mt-2 flex gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1.5 rounded-full"
                        disabled={summary.count === 0}
                        onClick={() => setReviewOpen(true)}
                    >
                        <Sparkles className="size-3.5" />
                        AI 点评
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1.5 rounded-full"
                        onClick={() => setFixOpen(true)}
                    >
                        <Tags className="size-3.5" />
                        补全分类
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-9 shrink-0 rounded-full"
                        aria-label="分类管理"
                        onClick={() => setManageOpen(true)}
                    >
                        <Settings2 className="size-4" />
                    </Button>
                </div>
            )}

            <section className="mt-5" aria-busy={isPending}>
                <div className="mb-2 flex items-baseline justify-between">
                    <h2 className="text-sm font-semibold">明细</h2>
                    {!isPending && !isError && (
                        <span className="text-xs text-muted-foreground">
                            {summary.count} 笔
                        </span>
                    )}
                </div>

                {isPending ? (
                    <JiZhangSkeleton />
                ) : isError ? (
                    <ErrorState
                        message={error.message}
                        onRetry={() => void refetch()}
                    />
                ) : days.length === 0 ? (
                    <EmptyState />
                ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {days.map((day) => (
                            <DayCard
                                key={day.date}
                                day={day}
                                getCategory={getCategory}
                                onEdit={setEditing}
                            />
                        ))}
                    </div>
                )}
            </section>

            <AiExpenseSheet
                open={aiEntryOpen}
                onClose={() => setAiEntryOpen(false)}
                sharedReceipt={sharedReceipt}
            />
            <AiExpenseReview
                open={reviewOpen}
                onClose={() => setReviewOpen(false)}
                days={days}
                range={dateRange}
            />
            <AiCategoryFix open={fixOpen} onClose={() => setFixOpen(false)} />
            <ManageCategoriesSheet
                open={manageOpen}
                onClose={() => setManageOpen(false)}
            />
            {editing && (
                <EditExpenseSheet
                    item={editing}
                    onClose={() => setEditing(null)}
                />
            )}
        </div>
    );
}
