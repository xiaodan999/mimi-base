import type { CSSProperties } from "react";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Carrot, Loader2, RefreshCw, Settings2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useCurrentUser } from "@/lib/auth";
import pb from "@/lib/pb";
import { qk } from "@/lib/query-keys";
import { toastPromise } from "@/lib/toast-promise";
import { cn } from "@/lib/utils";

import { useDinnerOptions } from "./-data";
import { type DinnerOption, spinPlan, spinTurns } from "./options";

// The sheet ships with the Home route chunk, so the first tap opens it right
// away; only the SVG wheel and the option manager are fetched on demand.
const loadDinnerWheel = () =>
    import("./-wheel").then((module) => ({ default: module.DinnerWheel }));
const loadDinnerManager = () =>
    import("./-manage").then((module) => ({ default: module.DinnerManager }));

const DinnerWheel = lazy(loadDinnerWheel);
const DinnerManager = lazy(loadDinnerManager);

/** Visible feedback while a lazy body chunk is still downloading. */
function DinnerPreparing() {
    return (
        <div
            role="status"
            aria-live="polite"
            className="grid h-[320px] place-items-center"
        >
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-6 animate-spin" aria-hidden="true" />
                正在准备转盘…
            </div>
        </div>
    );
}

const SPIN_MS = 4200;

/** Keep the winner name on at most two lines so the result slot stays fixed. */
function resultNameClass(name: string): string {
    const length = Array.from(name).length;
    if (length > 16) return "text-xl";
    if (length > 8) return "text-2xl";
    return "text-3xl";
}

/** Fixed confetti burst; deterministic so rendering never jitters. */
const CONFETTI = [
    { x: -78, y: -64, rot: 120, delay: 0, color: 1 },
    { x: -46, y: -86, rot: 220, delay: 40, color: 3 },
    { x: -14, y: -72, rot: 300, delay: 90, color: 5 },
    { x: 26, y: -88, rot: 160, delay: 30, color: 2 },
    { x: 62, y: -68, rot: 250, delay: 70, color: 4 },
    { x: 86, y: -34, rot: 340, delay: 120, color: 1 },
    { x: -92, y: -24, rot: 200, delay: 50, color: 6 },
    { x: -70, y: 18, rot: 280, delay: 110, color: 2 },
    { x: 74, y: 22, rot: 100, delay: 20, color: 5 },
    { x: -38, y: 36, rot: 320, delay: 80, color: 4 },
    { x: 34, y: 44, rot: 240, delay: 10, color: 3 },
    { x: 2, y: -48, rot: 180, delay: 60, color: 6 },
];

type DinnerLotteryDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

/**
 * The 晚餐抽奖机 surface. The heavy part is lazy-loaded from `home.tsx`, so
 * the greeting card paints without the wheel SVG or the management UI.
 */
export default function DinnerLotteryDialog({
    open,
    onOpenChange,
}: DinnerLotteryDialogProps) {
    const user = useCurrentUser();
    const queryClient = useQueryClient();
    const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
    const {
        data: options = [],
        isLoading,
        isError,
        refetch,
    } = useDinnerOptions();

    const [view, setView] = useState<"wheel" | "manage">("wheel");
    const [rotation, setRotation] = useState(0);
    const [phase, setPhase] = useState<"idle" | "spinning" | "result">("idle");
    const [picked, setPicked] = useState<DinnerOption | null>(null);
    const [saving, setSaving] = useState(false);
    const finishTimer = useRef<number | null>(null);
    const pickedIndex = picked
        ? options.findIndex((option) => option.id === picked.id)
        : -1;

    // Start the wheel chunk on open, so the download and the options query
    // run in parallel instead of one after the other.
    useEffect(() => {
        if (open) void loadDinnerWheel();
    }, [open]);

    useEffect(() => {
        return () => {
            if (finishTimer.current !== null) {
                window.clearTimeout(finishTimer.current);
            }
        };
    }, []);

    // A deleted option must not stay on screen as the winner.
    useEffect(() => {
        if (!isLoading && picked && !options.some((o) => o.id === picked.id)) {
            setPicked(null);
            setPhase("idle");
        }
    }, [options, picked, isLoading]);

    const finishSpin = () => {
        if (finishTimer.current !== null) {
            window.clearTimeout(finishTimer.current);
            finishTimer.current = null;
        }
        setPhase((current) => (current === "spinning" ? "result" : current));
    };

    const handleSpin = () => {
        if (phase === "spinning" || options.length === 0) return;
        const plan = spinPlan(
            options.length,
            rotation,
            Math.random,
            spinTurns(),
        );
        if (plan.index < 0) return;
        setPicked(options[plan.index]);
        setPhase("spinning");
        setRotation(plan.rotation);
        if (finishTimer.current !== null) {
            window.clearTimeout(finishTimer.current);
        }
        finishTimer.current = window.setTimeout(
            finishSpin,
            reducedMotion ? 40 : SPIN_MS,
        );
    };

    const handleSave = async () => {
        if (!picked || saving) return;
        setSaving(true);
        try {
            await toastPromise(
                pb.collection("posts").create({
                    text: `[晚餐抽奖机]: ${picked.name}`,
                    author_id: user.id,
                }),
                {
                    loading: `正在记录晚餐「${picked.name}」…`,
                    success: `今晚吃「${picked.name}」，已记到动态`,
                    error: "保存晚餐失败",
                    finally: () => {
                        setSaving(false);
                        void queryClient.invalidateQueries({
                            queryKey: qk.homeStats.all,
                        });
                        void queryClient.invalidateQueries({
                            queryKey: qk.posts.all,
                        });
                    },
                },
            );
            onOpenChange(false);
        } catch {
            // toastPromise already surfaced the error.
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                mobileSheet
                className="max-h-[92dvh] gap-0 overflow-y-auto overflow-x-hidden overscroll-contain p-0 sm:max-w-md"
            >
                <div
                    aria-hidden="true"
                    className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30 sm:hidden"
                />

                <div className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-0 sm:pb-0 sm:pt-0">
                    <div className="flex items-start gap-3 pr-8">
                        <div className="min-w-0 flex-1">
                            <DialogHeader className="space-y-1 text-left">
                                <DialogTitle className="flex items-center gap-2 text-xl">
                                    <span
                                        aria-hidden="true"
                                        className="grid size-8 place-items-center rounded-full bg-amber-500/15 text-base"
                                    >
                                        🍜
                                    </span>
                                    晚餐抽奖机
                                </DialogTitle>
                                <DialogDescription>
                                    {view === "wheel"
                                        ? "转一转，今晚不纠结。结果满意就记一条动态。"
                                        : "这份菜单两个人都能看到，改完立刻同步。"}
                                </DialogDescription>
                            </DialogHeader>
                        </div>
                    </div>

                    {view === "manage" ? (
                        <div className="mt-4">
                            <Suspense fallback={<DinnerPreparing />}>
                                <DinnerManager
                                    options={options}
                                    onBack={() => setView("wheel")}
                                />
                            </Suspense>
                        </div>
                    ) : isLoading ? (
                        <div className="grid h-[320px] place-items-center">
                            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                                <Loader2
                                    className="size-6 animate-spin"
                                    aria-hidden="true"
                                />
                                正在摆好转盘…
                            </div>
                        </div>
                    ) : isError ? (
                        <div className="mt-6 rounded-2xl border border-dashed border-border p-6 text-center">
                            <p className="text-sm text-muted-foreground">
                                转盘没加载出来，检查一下网络。
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-3"
                                onClick={() => void refetch()}
                            >
                                重新加载
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="mt-4">
                                <Suspense fallback={<DinnerPreparing />}>
                                    <DinnerWheel
                                        options={options}
                                        rotation={rotation}
                                        spinning={phase === "spinning"}
                                        reducedMotion={reducedMotion}
                                        selectedIndex={
                                            phase === "result"
                                                ? pickedIndex
                                                : -1
                                        }
                                        onSpin={handleSpin}
                                        onSpinEnd={finishSpin}
                                    />
                                </Suspense>
                            </div>

                            <div className="mt-3 flex items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground">
                                    共 {options.length} 个选项
                                    {reducedMotion && " · 已减少动态效果"}
                                </p>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 gap-1 px-2 text-xs"
                                    onClick={() => setView("manage")}
                                >
                                    <Settings2
                                        className="size-3.5"
                                        aria-hidden="true"
                                    />
                                    管理选项
                                </Button>
                            </div>

                            {/* Reserve the result card's height up front: the
                                sheet is bottom-anchored on phones, so growing
                                it when the result appears pushes the wheel up
                                and reads as a layout jump. */}
                            <div className="mt-3 flex min-h-[12.5rem] flex-col justify-center">
                                {phase === "spinning" && (
                                    <div
                                        role="status"
                                        aria-live="polite"
                                        className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border/80 px-4 py-3 text-sm text-muted-foreground"
                                    >
                                        <Loader2
                                            className="size-4 animate-spin"
                                            aria-hidden="true"
                                        />
                                        正在挑一个今晚的答案…
                                    </div>
                                )}

                                {phase === "idle" && (
                                    <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border/80 px-4 py-3 text-center text-sm text-muted-foreground">
                                        <Sparkles
                                            className="size-4 text-amber-500"
                                            aria-hidden="true"
                                        />
                                        点中间的「开转」，让运气决定今晚
                                    </div>
                                )}

                                {phase === "result" && picked && (
                                    <div
                                        key={picked.id}
                                        role="status"
                                        aria-live="polite"
                                        className="relative w-full overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-chart-3/10 p-4 shadow-soft animate-in fade-in-0 slide-in-from-bottom-2"
                                    >
                                        <div
                                            aria-hidden="true"
                                            className="pointer-events-none absolute inset-0 overflow-hidden"
                                        >
                                            {CONFETTI.map((piece, index) => (
                                                <span
                                                    key={index}
                                                    className="dinner-confetti absolute left-1/2 top-1/2 size-1.5 rounded-[1px]"
                                                    style={
                                                        {
                                                            backgroundColor: `hsl(var(--chart-${piece.color}))`,
                                                            "--tx": `${piece.x}px`,
                                                            "--ty": `${piece.y}px`,
                                                            "--rot": `${piece.rot}deg`,
                                                            animationDelay: `${piece.delay}ms`,
                                                        } as CSSProperties
                                                    }
                                                />
                                            ))}
                                        </div>

                                        <div className="relative text-center">
                                            <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground">
                                                今晚就吃
                                            </p>
                                            <p
                                                className={cn(
                                                    "mt-1 bg-gradient-to-r from-primary via-chart-2 to-chart-4 bg-clip-text font-extrabold tracking-tight text-transparent",
                                                    resultNameClass(
                                                        picked.name,
                                                    ),
                                                )}
                                            >
                                                {picked.name}
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                保存后会记一条动态
                                            </p>
                                            <div className="mt-3 flex gap-2">
                                                <Button
                                                    type="button"
                                                    className="h-11 flex-1 gap-1.5 font-semibold"
                                                    disabled={saving}
                                                    onClick={() =>
                                                        void handleSave()
                                                    }
                                                >
                                                    {saving ? (
                                                        <Loader2
                                                            className="size-4 animate-spin"
                                                            aria-hidden="true"
                                                        />
                                                    ) : (
                                                        <Carrot
                                                            className="size-4"
                                                            aria-hidden="true"
                                                        />
                                                    )}
                                                    就吃这个
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="h-11 shrink-0 gap-1.5"
                                                    disabled={saving}
                                                    onClick={handleSpin}
                                                >
                                                    <RefreshCw
                                                        className="size-4"
                                                        aria-hidden="true"
                                                    />
                                                    再抽一次
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
