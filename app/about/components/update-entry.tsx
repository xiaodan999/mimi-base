import { Link } from "@tanstack/react-router";
import {
    ArrowUpRight,
    ChevronDown,
    RefreshCw,
    Sparkles,
    Wrench,
} from "lucide-react";

import type { Update } from "@/app/about/updates";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import UpdateGroup from "./update-group";

export default function UpdateEntry({
    update,
    latest,
    open,
    onToggle,
}: {
    update: Update;
    latest: boolean;
    open: boolean;
    onToggle: () => void;
}) {
    const panelId = `update-panel-${update.date}`;
    const counts = [
        update.added?.length ? `新增 ${update.added.length}` : null,
        update.fixed?.length ? `修复 ${update.fixed.length}` : null,
        update.changed?.length ? `调整 ${update.changed.length}` : null,
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <article
            className={cn(
                "overflow-hidden rounded-2xl border bg-background transition-colors",
                latest ? "border-primary/30" : "border-border/60",
                latest && open && "bg-primary/[0.03]",
            )}
        >
            <button
                aria-controls={panelId}
                aria-expanded={open}
                className="flex w-full items-start justify-between gap-3 px-3.5 py-3 text-left"
                type="button"
                onClick={onToggle}
            >
                <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                            {update.title ?? update.date}
                        </span>
                        {latest && (
                            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] leading-none font-medium text-primary">
                                新
                            </span>
                        )}
                    </span>
                    {update.summary && (
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                            {update.summary}
                        </span>
                    )}
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>{formatUpdateDay(update.date)}</span>
                        {counts && (
                            <>
                                <span aria-hidden="true">·</span>
                                <span>{counts}</span>
                            </>
                        )}
                    </span>
                </span>
                <ChevronDown
                    aria-hidden="true"
                    className={cn(
                        "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                        open && "rotate-180",
                    )}
                />
            </button>

            <div
                aria-hidden={!open}
                className={cn(
                    "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                    open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
                id={panelId}
            >
                <div className="overflow-hidden">
                    <div className="px-3.5 pb-3.5">
                        {update.highlight && (
                            <div className="mt-1 rounded-xl border border-primary/20 bg-primary/[0.06] p-3">
                                <p className="flex items-center gap-1 text-[10px] font-medium text-primary">
                                    <Sparkles
                                        aria-hidden="true"
                                        className="size-3"
                                    />
                                    这次的重点
                                </p>
                                <p className="mt-1 text-sm leading-6">
                                    {update.highlight}
                                </p>
                            </div>
                        )}
                        <UpdateGroup
                            icon={Sparkles}
                            items={withoutHighlight(
                                update.added,
                                update.highlight,
                            )}
                            title="新增"
                        />
                        <UpdateGroup
                            icon={Wrench}
                            items={withoutHighlight(
                                update.fixed,
                                update.highlight,
                            )}
                            title="修复"
                        />
                        <UpdateGroup
                            icon={RefreshCw}
                            items={withoutHighlight(
                                update.changed,
                                update.highlight,
                            )}
                            title="调整"
                        />
                        {update.links?.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {update.links.map((link) => (
                                    <Button
                                        asChild
                                        className="h-8"
                                        key={`${link.to}-${link.label}`}
                                        size="sm"
                                        variant="outline"
                                    >
                                        <Link
                                            tabIndex={open ? undefined : -1}
                                            to={link.to}
                                        >
                                            {link.label}
                                            <ArrowUpRight
                                                aria-hidden="true"
                                                className="ml-1 size-3.5"
                                            />
                                        </Link>
                                    </Button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </article>
    );
}

function withoutHighlight(items?: string[], highlight?: string) {
    return items?.filter((item) => item !== highlight);
}

function formatUpdateDay(date: string): string {
    const [, month, day] = date.split("-");
    return `${Number(month)} 月 ${Number(day)} 日`;
}
