import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, Sparkles } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import NotificationBell from "@/app/notifications/components/notification-bell";
import { streakDays } from "@/app/study/engine";
import { useStudySummaries } from "@/app/study/progress";
import { FeedLoading } from "@/components/FeedLoading";
import ThemeToggle from "@/components/ThemeToggle";
import TouXiang from "@/components/TouXiang";
import { useCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { getUserAvatarUrl, getUserRing } from "@/lib/pb";
import { cn } from "@/lib/utils";

import { useHomeStats } from "./-home-data";
import DailyLine from "./-home/daily-line";
import DinnerLotteryDialog from "./-home/dinner/-dialog";

// The feed owns the post, composer, comment and viewer chunks; keeping it in
// its own bundle lets the greeting header paint before they load.
const HomeFeed = lazy(() => import("./-home/feed"));

type HomeSearch = {
    /** "YYYY-MM" — the feed only shows that month. */
    month?: string;
    /** Case-insensitive text search over post bodies. */
    q?: string;
    /** Deep link from the interaction inbox: show only this post. */
    post?: string;
    /** "1" opens the comment sheet for the deep-linked post. */
    comments?: "1";
};

export const Route = createFileRoute("/_protected/_main/home")({
    validateSearch: (search: Record<string, unknown>): HomeSearch => {
        const month =
            typeof search.month === "string" &&
            /^\d{4}-(0[1-9]|1[0-2])$/.test(search.month)
                ? search.month
                : undefined;
        const q = typeof search.q === "string" ? search.q.trim() : "";
        const post = typeof search.post === "string" ? search.post.trim() : "";
        return {
            month,
            q: q || undefined,
            post: post || undefined,
            comments: search.comments === "1" ? "1" : undefined,
        };
    },
    component: Page,
});

function Page() {
    const user = useCurrentUser();
    const { data: stats } = useHomeStats();
    const { data: summaries } = useStudySummaries();
    const streak = Math.max(
        0,
        ...Object.values(summaries ?? {}).map((progress) =>
            streakDays(progress),
        ),
    );

    const now = new Date();
    const hour = now.getHours();
    const greeting =
        hour < 6
            ? "夜深了"
            : hour < 12
              ? "早上好"
              : hour < 18
                ? "下午好"
                : "晚上好";
    const dateLabel = new Intl.DateTimeFormat("zh-CN", {
        month: "long",
        day: "numeric",
    }).format(now);
    const weekday = new Intl.DateTimeFormat("zh-CN", {
        weekday: "short",
    }).format(now);

    return (
        <div className="pt-[calc(1rem+env(safe-area-inset-top))]">
            <section className="mx-4 rounded-3xl border border-border/60 bg-card p-4 shadow-soft">
                <div className="flex items-center gap-2">
                    <Link
                        to="/profile"
                        aria-label="查看个人资料"
                        className="relative shrink-0 rounded-full"
                    >
                        <TouXiang
                            size={44}
                            touXiangUrl={getUserAvatarUrl(user)}
                            name={user.user_name}
                            {...getUserRing(user)}
                        />
                        <span
                            aria-hidden="true"
                            className="absolute -right-0.5 -bottom-0.5 grid h-4 w-4 place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-soft"
                        >
                            <Camera className="size-2.5" />
                        </span>
                    </Link>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium text-muted-foreground">
                            {greeting} · {dateLabel} {weekday}
                        </p>
                        <h1 className="truncate text-xl font-semibold tracking-tight">
                            <Link to="/profile">
                                {user.user_name || "朋友"}
                            </Link>
                        </h1>
                    </div>
                    <NotificationBell />
                    <DinnerPicker />
                    <ThemeToggle className="shrink-0" />
                </div>

                <DailyLine stats={stats} streak={streak} />

                <div className="mt-3 grid grid-cols-3 divide-x divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-background/40">
                    <Stat
                        label="今日动态"
                        value={stats ? stats.postsToday : "—"}
                        unit={stats ? "条" : undefined}
                    />
                    <Stat
                        to="/jizhang"
                        label="本月花费"
                        value={
                            stats ? formatMoney(stats.monthSpend, true) : "—"
                        }
                    />
                    <Stat
                        to="/study"
                        label="连续学习"
                        value={streak}
                        unit="天"
                    />
                </div>
            </section>

            <Suspense
                fallback={
                    <div className="px-3 pt-2">
                        <FeedLoading />
                    </div>
                }
            >
                <HomeFeed />
            </Suspense>
        </div>
    );
}

function Stat({
    to,
    label,
    value,
    unit,
}: {
    to?: "/jizhang" | "/study";
    label: string;
    value: string | number;
    unit?: string;
}) {
    const body = (
        <>
            <span className="text-sm font-semibold tabular-nums">
                {value}
                {unit && (
                    <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">
                        {unit}
                    </span>
                )}
            </span>
            <span className="mt-0.5 text-[10px] text-muted-foreground">
                {label}
            </span>
        </>
    );
    const className =
        "flex flex-col items-center justify-center py-2 transition-colors";

    if (!to) {
        return <div className={className}>{body}</div>;
    }

    return (
        <Link
            to={to}
            className={cn(className, "hover:bg-accent/50 active:bg-accent/60")}
        >
            {body}
        </Link>
    );
}

/**
 * The bowl in the greeting card opens the shared dinner wheel. The dialog
 * shell is part of this route chunk so the sheet opens on the first tap; the
 * SVG wheel and the management surface load lazily inside it, behind their
 * own "正在准备转盘…" status.
 */
function DinnerPicker() {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                aria-label="打开晚餐抽奖机"
                onClick={() => setOpen(true)}
                className="relative grid size-9 shrink-0 place-items-center rounded-full border border-amber-500/30 bg-linear-to-br from-amber-400/25 via-amber-500/10 to-chart-3/15 text-lg leading-none shadow-soft transition-transform hover:scale-105 active:scale-90"
            >
                <span aria-hidden="true">🍜</span>
                <Sparkles
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 size-3 text-amber-500"
                />
            </button>
            {open && <DinnerLotteryDialog open={open} onOpenChange={setOpen} />}
        </>
    );
}
