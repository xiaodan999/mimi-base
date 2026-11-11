import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** In-app destinations used as a page's back target. */
type BackTarget = "/home" | "/chat" | "/study" | "/profile";

type PageHeaderProps = {
    title: ReactNode;
    /** One short line under the title; keeps every page's top rhythm equal. */
    description?: ReactNode;
    /** Omit on bottom-nav tab roots, where the nav bar is the way back. */
    backTo?: BackTarget;
    backLabel?: string;
    /** Right-aligned page actions (refresh, add, filter, ...). */
    actions?: ReactNode;
    /**
     * Put the description on its own row under the title and actions so a
     * wide action row cannot squeeze it. Used by the chat list.
     */
    stackedDescription?: boolean;
    /** Smaller title row for in-thread app bars (chat conversations). */
    compact?: boolean;
    className?: string;
};

/**
 * Shared page header: same title size, description spacing, back button and
 * action row on every screen. Home is the exception because its greeting card
 * already owns the top of the feed.
 */
export default function PageHeader({
    title,
    description,
    backTo,
    backLabel,
    actions,
    stackedDescription = false,
    compact = false,
    className,
}: PageHeaderProps) {
    return (
        <header
            className={cn(
                "flex items-start",
                compact ? "gap-1" : "gap-2",
                className,
            )}
        >
            {backTo ? (
                <Link
                    to={backTo}
                    aria-label={backLabel ?? "返回"}
                    className={cn(
                        "grid shrink-0 place-items-center border border-border/60 bg-card/70 text-muted-foreground transition-colors hover:text-foreground active:scale-95",
                        compact ? "size-8 rounded-lg" : "size-9 rounded-full",
                    )}
                >
                    <ChevronLeft className="size-4" aria-hidden="true" />
                </Link>
            ) : null}
            <div className="min-w-0 flex-1">
                <div
                    className={cn(
                        stackedDescription
                            ? // The actions span the title and description rows,
                              // so they reserve their width without making the
                              // title row taller than its line box.
                              "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2"
                            : "flex items-start",
                        !stackedDescription && (compact ? "gap-1" : "gap-2"),
                    )}
                >
                    <div className="min-w-0 flex-1">
                        <h1
                            className={cn(
                                "truncate tracking-tight",
                                compact
                                    ? "text-base font-semibold"
                                    : "text-2xl font-semibold",
                            )}
                        >
                            {title}
                        </h1>
                        {description && !stackedDescription ? (
                            <p
                                className={cn(
                                    "text-muted-foreground",
                                    compact
                                        ? "mt-0.5 text-[11px] leading-4"
                                        : "mt-1 text-sm leading-5",
                                )}
                            >
                                {description}
                            </p>
                        ) : null}
                    </div>
                    {actions ? (
                        <div
                            className={cn(
                                "flex shrink-0",
                                stackedDescription && description
                                    ? "col-start-2 row-span-2 row-start-1 self-start"
                                    : "items-center",
                                compact ? "gap-1" : "gap-2",
                            )}
                        >
                            {actions}
                        </div>
                    ) : null}
                    {description && stackedDescription ? (
                        <p
                            className={cn(
                                "col-span-2 col-start-1 row-start-2 text-muted-foreground",
                                compact
                                    ? "mt-0.5 text-[11px] leading-4"
                                    : "mt-1 text-sm leading-5",
                            )}
                        >
                            {description}
                        </p>
                    ) : null}
                </div>
            </div>
        </header>
    );
}
