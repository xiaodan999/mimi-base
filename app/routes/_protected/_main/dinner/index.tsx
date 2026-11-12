import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Loader2, Settings2, Soup, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { DinnerManager } from "@/app/dinner/components/manager";
import {
    type DinnerPhase,
    DinnerResultPanel,
} from "@/app/dinner/components/result-panel";
import { DinnerWheel } from "@/app/dinner/components/wheel";
import { useDinnerOptions } from "@/app/dinner/data";
import { type DinnerOption, spinPlan, spinTurns } from "@/app/dinner/options";
import { ErrorState } from "@/components/ErrorState";
import PageHeader from "@/components/PageHeader";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useCurrentUser } from "@/lib/auth";
import pb from "@/lib/pb";
import { qk } from "@/lib/query-keys";
import { toastPromise } from "@/lib/toast-promise";
import { cn } from "@/lib/utils";

/** Must match the rotor transition in globals.css (`dinner-wheel-rotor`). */
const SPIN_MS = 4200;

export const Route = createFileRoute("/_protected/_main/dinner/")({
    component: Page,
});

function Page() {
    const user = useCurrentUser();
    const queryClient = useQueryClient();
    const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
    const {
        data: options = [],
        isLoading,
        isError,
        refetch,
    } = useDinnerOptions();

    const [phase, setPhase] = useState<DinnerPhase>("idle");
    const [rotation, setRotation] = useState(0);
    const [picked, setPicked] = useState<DinnerOption | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [showManager, setShowManager] = useState(false);
    const finishTimer = useRef<number | null>(null);
    const managerRef = useRef<HTMLElement | null>(null);

    const pickedIndex = picked
        ? options.findIndex((option) => option.id === picked.id)
        : -1;

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
            setSaved(false);
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
        setSaved(false);
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
            setSaved(true);
        } catch {
            // toastPromise already surfaced the error.
        }
    };

    const openManager = () => {
        setShowManager(true);
        window.requestAnimationFrame(() => {
            managerRef.current?.scrollIntoView({
                behavior: reducedMotion ? "auto" : "smooth",
                block: "nearest",
            });
        });
    };

    return (
        <div className="mx-auto w-full max-w-4xl overflow-x-clip px-0 pt-[calc(1rem+env(safe-area-inset-top))] pb-28">
            <div className="px-4">
                <PageHeader
                    backTo="/home"
                    backLabel="返回首页"
                    title="晚餐抽奖机"
                    description="转一转，今晚不纠结；满意就记到动态。"
                />
            </div>

            <section
                data-testid="dinner-stage"
                className="relative mx-3 mt-4 overflow-hidden rounded-[2rem] border border-amber-500/20 bg-linear-to-br from-amber-500/10 via-card to-chart-3/10 shadow-soft"
            >
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full bg-amber-400/15 blur-3xl"
                />
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-24 -left-16 size-56 rounded-full bg-chart-2/10 blur-3xl"
                />
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 [background-image:radial-gradient(hsl(var(--muted-foreground)/0.18)_1px,transparent_1px)] [background-size:16px_16px] opacity-30"
                />

                <div className="relative p-3 pt-4 sm:p-5 lg:p-6">
                    <div className="flex items-center justify-between gap-2 px-1 pb-3">
                        <p className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                            <Soup
                                className="size-4 text-amber-600 dark:text-amber-400"
                                aria-hidden="true"
                            />
                            今晚吃什么
                        </p>
                        <div className="flex shrink-0 items-center gap-1.5">
                            {reducedMotion && (
                                <span className="rounded-full border border-border/60 bg-background/70 px-2 py-1 text-[10px] font-medium text-muted-foreground">
                                    减少动态
                                </span>
                            )}
                            <span className="rounded-full border border-amber-500/25 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                                菜单 {isLoading ? "…" : options.length} 道
                            </span>
                        </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-stretch">
                        <div className="min-w-0">
                            {isError ? (
                                <div className="mx-auto grid aspect-square w-full max-w-[26rem] place-items-center rounded-full border border-dashed border-border bg-background/50">
                                    <ErrorState
                                        message="转盘没加载出来，检查一下网络。"
                                        onRetry={() => void refetch()}
                                    />
                                </div>
                            ) : isLoading ? (
                                <div
                                    role="status"
                                    aria-live="polite"
                                    className="mx-auto grid aspect-square w-full max-w-[26rem] place-items-center"
                                >
                                    <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2
                                            className="size-6 animate-spin"
                                            aria-hidden="true"
                                        />
                                        正在摆好转盘…
                                    </div>
                                </div>
                            ) : (
                                <DinnerWheel
                                    options={options}
                                    rotation={rotation}
                                    spinning={phase === "spinning"}
                                    reducedMotion={reducedMotion}
                                    selectedIndex={
                                        phase === "result" ? pickedIndex : -1
                                    }
                                    onSpin={handleSpin}
                                    onSpinEnd={finishSpin}
                                />
                            )}
                        </div>

                        {/* The answer panel owns a fixed box below the wheel
                            (and a full-height column on wide screens), so a
                            finished spin swaps text instead of resizing the
                            page. */}
                        <div
                            data-testid="dinner-result-slot"
                            className="h-64 lg:h-auto"
                        >
                            <DinnerResultPanel
                                phase={phase}
                                picked={picked}
                                optionCount={options.length}
                                loading={isLoading}
                                error={isError}
                                saving={saving}
                                saved={saved}
                                onSave={() => void handleSave()}
                                onRespin={handleSpin}
                                onManage={openManager}
                            />
                        </div>
                    </div>
                </div>
            </section>

            <section
                ref={managerRef}
                className="mx-4 mt-4 scroll-mt-4 overflow-hidden rounded-3xl border border-border/60 bg-card shadow-soft"
            >
                <button
                    type="button"
                    aria-expanded={showManager}
                    aria-controls="dinner-manager"
                    onClick={() => setShowManager((open) => !open)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-accent/60"
                >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                        <Settings2 className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                            管理菜单
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                            两个人共享同一份菜单 · 共 {options.length} 个选项
                        </span>
                    </span>
                    <ChevronDown
                        className={cn(
                            "size-4 shrink-0 text-muted-foreground transition-transform",
                            showManager && "rotate-180",
                        )}
                        aria-hidden="true"
                    />
                </button>
                <div
                    id="dinner-manager"
                    hidden={!showManager}
                    className="border-t border-border/60 bg-background/40 p-4"
                >
                    {showManager && <DinnerManager options={options} />}
                </div>
            </section>

            <p className="mt-4 flex items-center justify-center gap-1.5 px-4 text-center text-xs text-muted-foreground">
                <Sparkles
                    className="size-3.5 shrink-0 text-amber-500"
                    aria-hidden="true"
                />
                菜单由两个人共享，改完立刻同步
            </p>
        </div>
    );
}
