import { Play, Plus, X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type MediaGridProps = {
    children: ReactNode;
    className?: string;
};

/** The three-column square grid shared by pickers and upload previews. */
export function MediaGrid({ children, className }: MediaGridProps) {
    return (
        <div className={cn("grid grid-cols-3 gap-2", className)}>
            {children}
        </div>
    );
}

export type MediaTileMedia =
    | { type: "image"; src: string; alt?: string }
    | { type: "video"; src: string; alt?: string };

type MediaTileProps = {
    media?: MediaTileMedia;
    /** Replaces the default square tile surface when a caller needs another shape. */
    className?: string;
    /** Ring highlight for a chosen tile. */
    selected?: boolean;
    /** Dims the tile and blocks its open/remove actions. */
    disabled?: boolean;
    /** Top-left label: order number, 封面, duration… */
    badge?: ReactNode;
    /** Bottom-left label: file size or name. */
    caption?: ReactNode;
    /** Opens the full-size media with a transparent full-tile button. */
    onOpen?: () => void;
    openLabel?: string;
    /** Adds a labelled corner remove button. */
    onRemove?: () => void;
    removeLabel?: string;
    /** Extra content above the media (spinner, check mark…). */
    overlay?: ReactNode;
    /** Drag affordances for the sort sheet; the handlers stay with the caller. */
    sortable?: boolean;
    /** Smaller corner controls for thumbnails below ~4rem. */
    compact?: boolean;
};

/**
 * One square media cell. Photos and video first frames use the same box, so a
 * picker grid stays aligned while files load. Callers can make the whole tile
 * clickable with `onOpen` (comment images, pickers) or mount their own
 * draggable wrapper around it (the composer's sort sheet).
 */
export function MediaTile({
    media,
    className,
    selected = false,
    disabled = false,
    badge,
    caption,
    onOpen,
    openLabel = "查看",
    onRemove,
    removeLabel = "移除",
    overlay,
    sortable = false,
    compact = false,
}: MediaTileProps) {
    return (
        <div
            data-selected={selected || undefined}
            className={cn(
                "relative aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted",
                sortable && "touch-none select-none",
                selected &&
                    "ring-2 ring-primary ring-offset-2 ring-offset-background",
                disabled && "opacity-60",
                className,
            )}
        >
            {media?.type === "image" && (
                <img
                    src={media.src}
                    alt={media.alt ?? ""}
                    loading="lazy"
                    draggable={false}
                    className="size-full object-cover"
                />
            )}
            {media?.type === "video" && (
                <>
                    <video
                        src={media.src}
                        muted
                        playsInline
                        preload="metadata"
                        aria-label={media.alt ?? "视频预览"}
                        className="size-full bg-black object-cover"
                    />
                    <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 grid place-items-center"
                    >
                        <span className="grid size-9 place-items-center rounded-full bg-black/55 text-white ring-1 ring-white/30 backdrop-blur-sm">
                            <Play className="ml-0.5 size-4 fill-current" />
                        </span>
                    </span>
                </>
            )}

            {onOpen && (
                <button
                    type="button"
                    aria-label={openLabel}
                    disabled={disabled}
                    className="absolute inset-0 z-[1]"
                    onClick={onOpen}
                />
            )}

            {badge && (
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1.5 left-1.5 z-[2] grid h-6 min-w-6 place-items-center rounded-full bg-black/65 px-1.5 text-[10px] font-semibold text-white"
                >
                    {badge}
                </span>
            )}

            {caption && (
                <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-[2] rounded bg-black/65 px-1 text-[10px] leading-4 text-white tabular-nums">
                    {caption}
                </span>
            )}

            {overlay}

            {onRemove && (
                <button
                    type="button"
                    aria-label={removeLabel}
                    disabled={disabled}
                    className={cn(
                        "absolute top-1.5 right-1.5 z-[3] grid place-items-center rounded-full bg-black/65 text-white transition-colors hover:bg-black/80 disabled:opacity-50",
                        compact ? "size-6" : "size-7",
                    )}
                    onClick={onRemove}
                >
                    <X
                        className={compact ? "size-3" : "size-3.5"}
                        aria-hidden="true"
                    />
                </button>
            )}
        </div>
    );
}

type MediaAddTileProps = {
    onClick: () => void;
    label: string;
    disabled?: boolean;
    className?: string;
};

/** The dashed "add more" cell that closes a picker grid. */
export function MediaAddTile({
    onClick,
    label,
    disabled = false,
    className,
}: MediaAddTileProps) {
    return (
        <button
            type="button"
            aria-label={label}
            disabled={disabled}
            className={cn(
                "grid aspect-square place-items-center rounded-xl border border-dashed border-input bg-muted/40 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50",
                className,
            )}
            onClick={onClick}
        >
            <Plus className="size-6" aria-hidden="true" />
        </button>
    );
}
