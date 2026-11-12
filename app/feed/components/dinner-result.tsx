import { Soup, Sparkles } from "lucide-react";

/**
 * A saved 晚餐抽奖机 result, styled as a small meal ticket inside the
 * timeline. The decoration is static (dotted paper, a warm glow and two
 * sparkles) so scrolling the feed never replays an animation; the dish name
 * itself stays selectable text for screen readers and long names wrap.
 */
export function DinnerResultCard({ name }: { name: string }) {
    return (
        <div className="relative mt-2 overflow-hidden rounded-2xl border border-amber-500/25 bg-linear-to-br from-amber-500/15 via-card to-primary/10 p-4 shadow-soft dark:border-amber-300/20 dark:from-amber-400/10 dark:via-card dark:to-primary/15">
            {/* Dotted paper and a soft warm glow; both purely decorative. */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{
                    backgroundImage:
                        "radial-gradient(hsl(var(--primary) / 0.16) 1px, transparent 1px)",
                    backgroundSize: "14px 14px",
                }}
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-10 -right-8 size-28 rounded-full bg-chart-3/20 blur-2xl"
            />
            <Sparkles
                aria-hidden="true"
                className="pointer-events-none absolute top-3 right-3.5 size-4 text-amber-500"
            />
            <Sparkles
                aria-hidden="true"
                className="pointer-events-none absolute top-9 right-9 size-2.5 text-chart-3"
            />

            <div className="relative flex items-start gap-3">
                <span className="relative grid size-11 shrink-0 place-items-center rounded-full border border-amber-500/30 bg-linear-to-br from-amber-500/25 via-card to-primary/15 shadow-xs dark:border-amber-300/25">
                    <span
                        aria-hidden="true"
                        className="absolute inset-1 rounded-full border border-dashed border-amber-600/30 dark:border-amber-300/30"
                    />
                    <Soup
                        aria-hidden="true"
                        className="size-5 text-amber-700 dark:text-amber-300"
                    />
                </span>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[11px] font-semibold tracking-[0.18em] text-amber-800 dark:text-amber-200">
                            晚餐抽奖机
                        </span>
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-300/30 dark:text-amber-200">
                            今晚吃
                        </span>
                    </div>

                    <p className="mt-1 text-[20px] leading-snug font-extrabold tracking-tight break-words text-foreground">
                        {name}
                    </p>

                    <div className="mt-2 flex items-center gap-2">
                        <span
                            aria-hidden="true"
                            className="h-0.5 w-8 shrink-0 rounded-full bg-linear-to-r from-amber-500 via-chart-3 to-primary/40"
                        />
                        <span className="text-[11px] text-muted-foreground">
                            转盘替你做了决定
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
