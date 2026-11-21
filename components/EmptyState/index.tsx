import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type EmptyStateProps = {
    /** Icon element, usually a lucide icon or an emoji. */
    icon?: ReactNode;
    title?: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    /**
     * Drop the dashed surface when the caller already paints one (a sheet,
     * a card or an inline notice).
     */
    bare?: boolean;
    className?: string;
    /** Extra classes for the description, e.g. a max width. */
    descriptionClassName?: string;
};

/**
 * The shared "nothing here yet" surface. It standardises the dashed card,
 * the tinted icon well and the title/description/action rhythm so every
 * feature stops rolling its own centred stack.
 *
 * Copy stays with the caller: a page that needs specific wording or an
 * action passes it through. `title` and `description` accept nodes so a
 * caller can keep an emphasised fragment without re-implementing the layout.
 */
export function EmptyState({
    icon,
    title,
    description,
    action,
    bare = false,
    className,
    descriptionClassName,
}: EmptyStateProps) {
    return (
        <div
            className={cn(
                "flex flex-col items-center text-center",
                !bare &&
                    "rounded-2xl border border-dashed border-border bg-card/60 px-6 py-10",
                className,
            )}
        >
            {icon && (
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    {icon}
                </span>
            )}
            {title && (
                <h3
                    className={cn(
                        "text-sm font-semibold text-foreground",
                        icon && "mt-3",
                    )}
                >
                    {title}
                </h3>
            )}
            {description && (
                <p
                    className={cn(
                        "text-xs leading-relaxed text-muted-foreground",
                        (icon || title) && "mt-1",
                        descriptionClassName,
                    )}
                >
                    {description}
                </p>
            )}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}
