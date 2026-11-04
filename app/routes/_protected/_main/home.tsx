import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
    Camera,
    Carrot,
    Flame,
    Ham,
    MessageCircle,
    UtensilsCrossed,
    Wallet,
    type LucideIcon,
} from "lucide-react";

import StudyEntry from "@/app/study/components/StudyEntry";
import { streakDays } from "@/app/study/engine";
import { useStudySummaries } from "@/app/study/progress";
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

import { useHomeStats } from "./-home-data";

export const Route = createFileRoute("/_protected/_main/home")({
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
        <div className="px-4 pb-8 pt-[calc(1rem+env(safe-area-inset-top))]">
            <section className="rounded-3xl border border-border/60 bg-card p-5 shadow-soft">
                <div className="flex items-center gap-3">
                    <Link
                        to="/profile"
                        aria-label="查看个人资料"
                        className="relative shrink-0 rounded-full"
                    >
                        <TouXiang
                            size={56}
                            touXiangUrl={getUserAvatarUrl(user)}
                            {...getUserRing(user)}
                        />
                        <span
                            aria-hidden="true"
                            className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-soft"
                        >
                            <Camera className="size-3" />
                        </span>
                    </Link>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-muted-foreground">
                            {greeting} · {dateLabel} {weekday}
                        </p>
                        <h1 className="truncate text-2xl font-semibold tracking-tight">
                            <Link to="/profile" className="hover:underline">
                                {user.user_name || "朋友"}
                            </Link>
                        </h1>
                    </div>
                    <ThemeToggle className="shrink-0 self-start border-border/60 bg-background/60" />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                    今天也来记录一点什么吧。
                </p>
            </section>

            <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat
                    icon={MessageCircle}
                    label="今日动态"
                    value={stats?.postsToday ?? "—"}
                    unit={stats ? "条" : undefined}
                />
                <Stat
                    icon={Wallet}
                    label="本月花费"
                    value={stats ? formatMoney(stats.monthSpend, true) : "—"}
                />
                <Stat icon={Flame} label="连续学习" value={streak} unit="天" />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
                <QuickLink to="/posts" icon={MessageCircle} label="记录动态" />
                <QuickLink to="/jizhang" icon={Wallet} label="记一笔" />
            </div>

            <div className="mt-4">
                <StudyEntry />
            </div>

            <section className="mt-4 flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-soft">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <UtensilsCrossed className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">今晚吃什么</p>
                    <p className="text-xs text-muted-foreground">
                        让抽奖机替你决定
                    </p>
                </div>
                <DinnerPicker />
            </section>

            <p className="mt-6 text-center text-[10px] font-medium text-muted-foreground">
                秘密基地 · V{APP_VERSION}
            </p>
        </div>
    );
}

function Stat({
    icon: Icon,
    label,
    value,
    unit,
}: {
    icon: LucideIcon;
    label: string;
    value: string | number;
    unit?: string;
}) {
    return (
        <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-soft">
            <Icon className="size-4 text-primary" aria-hidden="true" />
            <div className="mt-2 flex items-baseline gap-0.5">
                <span className="text-xl font-semibold tabular-nums">
                    {value}
                </span>
                {unit && (
                    <span className="text-[10px] font-medium text-muted-foreground">
                        {unit}
                    </span>
                )}
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
        </div>
    );
}

function QuickLink({
    to,
    icon: Icon,
    label,
}: {
    to: "/posts" | "/jizhang";
    icon: LucideIcon;
    label: string;
}) {
    return (
        <Link
            to={to}
            className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm font-semibold shadow-soft transition-all duration-150 hover:bg-accent active:scale-[0.99]"
        >
            <Icon className="size-4 text-primary" aria-hidden="true" />
            {label}
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
                <Button
                    size="sm"
                    className="shrink-0 gap-1"
                    onClick={handlePick}
                >
                    <Ham className="size-4" />
                    <span>抽一下</span>
                </Button>
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
