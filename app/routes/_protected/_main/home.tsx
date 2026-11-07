import { Suspense, lazy, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Camera, Carrot } from "lucide-react";

import { streakDays } from "@/app/study/engine";
import { useStudySummaries } from "@/app/study/progress";
import { FeedSkeleton } from "@/components/FeedSkeleton";
import ThemeToggle from "@/components/ThemeToggle";
import TouXiang from "@/components/TouXiang";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import pb, { getUserAvatarUrl, getUserRing } from "@/lib/pb";
import { qk } from "@/lib/query-keys";
import { toastPromise } from "@/lib/toast-promise";
import { cn } from "@/lib/utils";

import DailyLine from "./-home/daily-line";
import { useHomeStats } from "./-home-data";

// The feed owns the post, composer, comment and viewer chunks; keeping it in
// its own bundle lets the greeting header paint before they load.
const HomeFeed = lazy(() => import("./-home/feed"));

type HomeSearch = {
    /** "YYYY-MM" — the feed only shows that month. */
    month?: string;
    /** Case-insensitive text search over post bodies. */
    q?: string;
};

export const Route = createFileRoute("/_protected/_main/home")({
    validateSearch: (search: Record<string, unknown>): HomeSearch => {
        const month =
            typeof search.month === "string" &&
            /^\d{4}-(0[1-9]|1[0-2])$/.test(search.month)
                ? search.month
                : undefined;
        const q = typeof search.q === "string" ? search.q.trim() : "";
        return { month, q: q || undefined };
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
                            className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-soft"
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
                    <DinnerPicker />
                    <ThemeToggle className="shrink-0" />
                </div>

                <DailyLine greeting={greeting} stats={stats} streak={streak} />

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
                        <FeedSkeleton />
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

const DINNER = [
    { name: "螺蛳粉" },
    { name: "塔斯丁" },
    { name: "肯德基" },
    { name: "酸菜鱼" },
    { name: "方便面" },
    { name: "煮饭" },
    { name: "烤鸡腿" },
    { name: "沙县小吃" },
    { name: "面总管" },
    { name: "烧烤" },
    { name: "披萨" },
    { name: "水果" },
    { name: "蔬菜沙拉" },
    { name: "喜姐烤串" },
    { name: "徽派" },
    { name: "奶茶" },
    { name: "咖喱饭" },
    { name: "兰州拉面" },
    { name: "李记麻辣烫" },
    { name: "杨国福麻辣烫" },
    { name: "老北京火锅" },
    { name: "酸辣粉" },
    { name: "小龙虾" },
    { name: "李记一绝臭豆腐" },
    { name: "胖哥俩" },
    { name: "瘦肉丸" },
    { name: "泡泡酸辣粉" },
    { name: "面包" },
];

const generateMealFn = () => {
    const index = Math.floor(Math.random() * DINNER.length);
    const dinnerName = DINNER[index].name;
    return dinnerName;
};

/**
 * 晚餐抽奖机 as a compact icon button in the greeting card: tapping the bowl
 * rolls a dinner and opens the same confirm dialog as before.
 */
function DinnerPicker() {
    const user = useCurrentUser();
    const queryClient = useQueryClient();
    const [dinnerName, setDinnerName] = useState("");
    const [loading, setLoading] = useState(false);
    const [saveLoading, setSaveLoading] = useState(false);
    const [visible, setVisible] = useState(false);

    const handlePick = async () => {
        setLoading(true);
        const name = await generateMealFn();
        setDinnerName(name);
        setLoading(false);
    };

    const handleSave = async (dinner: string) => {
        setSaveLoading(true);
        try {
            await toastPromise(
                pb.collection("posts").create({
                    text: `[晚餐抽奖机]: ${dinner}`,
                    author_id: user.id,
                }),
                {
                    loading: `正在记录晚餐 '${dinner}'...`,
                    error: "保存晚餐失败",
                    success: `已将 '${dinner}' 记录在案, 去吃吧.`,
                    finally: () => {
                        setVisible(false);
                        setSaveLoading(false);
                        void queryClient.invalidateQueries({
                            queryKey: qk.homeStats.all,
                        });
                        void queryClient.invalidateQueries({
                            queryKey: qk.posts.all,
                        });
                    },
                },
            );
        } catch {
            // toastPromise already surfaced the error.
        }
    };

    return (
        <Dialog open={visible} onOpenChange={setVisible}>
            <DialogTrigger asChild>
                <button
                    type="button"
                    onClick={handlePick}
                    aria-label="今晚吃什么（晚餐抽奖）"
                    className="grid size-9 shrink-0 place-items-center rounded-full border border-amber-500/30 bg-amber-500/10 text-lg leading-none transition-transform hover:scale-105 active:scale-90"
                >
                    <span aria-hidden="true">🍜</span>
                </button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        <span className="mr-1 inline-block align-middle">
                            晚餐吃
                        </span>
                        <span className="inline-block align-middle">
                            {loading ? <LoadingSpinner /> : `"${dinnerName}"`}
                        </span>
                    </DialogTitle>
                </DialogHeader>
                <DialogDescription>恭喜你抽取到了该晚餐!</DialogDescription>
                <DialogFooter>
                    <Button
                        type="submit"
                        className="gap-1"
                        disabled={loading || saveLoading}
                        onClick={() => handleSave(dinnerName)}
                    >
                        <Carrot className="size-4" />
                        <span>保存</span>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
