import { Link } from "@tanstack/react-router";
import {
    Carrot,
    Check,
    Loader2,
    RefreshCw,
    Sparkles,
    UtensilsCrossed,
} from "lucide-react";
import type { CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
    type DinnerOption,
    type DinnerResultNameSize,
    resultNameSize,
} from "../options";

export type DinnerPhase = "idle" | "spinning" | "result";

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

/** Keeps a 24-character winner inside two lines of the fixed-height card. */
const NAME_SIZE: Record<DinnerResultNameSize, string> = {
    short: "text-3xl",
    medium: "text-2xl",
    long: "text-xl",
};

type DinnerResultPanelProps = {
    phase: DinnerPhase;
    picked: DinnerOption | null;
    optionCount: number;
    loading: boolean;
    error: boolean;
    saving: boolean;
    saved: boolean;
    onSave: () => void;
    onRespin: () => void;
    onManage: () => void;
};

/**
 * The right-hand (or below-the-wheel) answer panel. It always occupies the
 * same box: idle, spinning and result swap their contents inside a fixed
 * height, so a finished spin can never resize the page or shift the wheel.
 */
export function DinnerResultPanel({
    phase,
    picked,
    optionCount,
    loading,
    error,
    saving,
    saved,
    onSave,
    onRespin,
    onManage,
}: DinnerResultPanelProps) {
    if (phase === "result" && picked) {
        return (
            <div
                key={picked.id}
                role="status"
                aria-live="polite"
                className="relative flex h-full flex-col justify-center overflow-hidden rounded-[1.75rem] border border-primary/25 bg-linear-to-br from-primary/12 via-card to-chart-3/15 p-5 text-center shadow-soft"
            >
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 overflow-hidden"
                >
                    {CONFETTI.map((piece, index) => (
                        <span
                            key={index}
                            className="dinner-confetti absolute top-1/2 left-1/2 size-1.5 rounded-[1px] motion-reduce:hidden"
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

                <div className="relative">
                    <p className="text-[11px] font-medium tracking-[0.25em] text-muted-foreground">
                        今晚就吃
                    </p>
                    <p
                        className={cn(
                            "mt-1 bg-linear-to-r from-primary via-chart-2 to-chart-4 bg-clip-text font-extrabold tracking-tight text-transparent",
                            NAME_SIZE[resultNameSize(picked.name)],
                        )}
                    >
                        {picked.name}
                    </p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                        {saved ? "已经记到动态了" : "满意的话，把它记到动态"}
                    </p>
                    <div className="mt-4 flex gap-2">
                        {saved ? (
                            <Button
                                asChild
                                className="h-11 flex-1 gap-1.5 font-semibold"
                            >
                                <Link to="/home">
                                    <Check
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    去看看动态
                                </Link>
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                className="h-11 flex-1 gap-1.5 font-semibold"
                                disabled={saving}
                                onClick={onSave}
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
                        )}
                        <Button
                            type="button"
                            variant="outline"
                            className="h-11 shrink-0 gap-1.5"
                            disabled={saving}
                            onClick={onRespin}
                        >
                            <RefreshCw className="size-4" aria-hidden="true" />
                            再抽一次
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    if (phase === "spinning") {
        return (
            <div
                role="status"
                aria-live="polite"
                className="flex h-full flex-col items-center justify-center overflow-hidden rounded-[1.75rem] border border-border/60 bg-background/60 px-5 py-6 text-center"
            >
                <span className="relative grid size-16 place-items-center rounded-full bg-primary/10 text-primary">
                    <Loader2
                        className="size-7 animate-spin"
                        aria-hidden="true"
                    />
                    <Sparkles
                        className="absolute -top-1 -right-1 size-4 text-amber-500"
                        aria-hidden="true"
                    />
                </span>
                <p className="mt-4 text-lg font-semibold tracking-tight">
                    正在翻菜单…
                </p>
                <p className="mt-1.5 max-w-[16rem] text-sm text-muted-foreground">
                    转盘停下，今晚的答案就出现在这里。
                </p>
            </div>
        );
    }

    return (
        <div className="relative flex h-full flex-col items-center justify-center overflow-hidden rounded-[1.75rem] border border-dashed border-amber-500/35 bg-background/60 px-5 py-6 text-center">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-chart-2/10 blur-2xl"
            />
            <span className="relative grid size-14 place-items-center rounded-full border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <UtensilsCrossed className="size-6" aria-hidden="true" />
                <Sparkles
                    className="absolute -top-1 -right-1 size-4 text-amber-500"
                    aria-hidden="true"
                />
            </span>
            <p className="mt-4 text-[11px] font-medium tracking-[0.25em] text-muted-foreground">
                今晚的神秘答案
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight">
                {loading
                    ? "正在摆好菜单…"
                    : error
                      ? "菜单没加载出来"
                      : optionCount > 0
                        ? "先转一下转盘"
                        : "转盘还是空的"}
            </p>
            <p className="mt-2 max-w-[17rem] text-sm text-muted-foreground">
                {loading
                    ? "转盘马上就好。"
                    : error
                      ? "检查一下网络，再点上面的重新加载。"
                      : optionCount > 0
                        ? `菜单上有 ${optionCount} 道菜，今晚吃哪一道交给运气。`
                        : "先加几道想吃的，再回来让运气决定。"}
            </p>
            {!loading && !error && optionCount === 0 ? (
                <Button
                    type="button"
                    variant="outline"
                    className="mt-4 h-10 gap-1.5"
                    onClick={onManage}
                >
                    <UtensilsCrossed className="size-4" aria-hidden="true" />
                    去加几道菜
                </Button>
            ) : null}
            {!loading && !error && optionCount > 0 ? (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-700 dark:text-amber-300">
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    转完答案会亮在这里
                </p>
            ) : null}
        </div>
    );
}
