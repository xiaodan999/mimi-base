import type { ComponentType } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { shortSha } from "@/lib/version";

export function browserLabel(userAgent: string): string {
    if (/Edg\//.test(userAgent)) return "Edge";
    if (/Firefox\//.test(userAgent)) return "Firefox";
    if (/CriOS\//.test(userAgent)) return "Chrome iOS";
    if (/Chrome\//.test(userAgent)) return "Chrome";
    if (/Safari\//.test(userAgent)) return "Safari";
    return "浏览器";
}

export function appVersionLabel(): string {
    const version = typeof APP_VERSION === "string" ? APP_VERSION : "0.0.0";
    const sha = typeof APP_SHA === "string" ? shortSha(APP_SHA) : "开发版";
    return `${version} · ${sha}`;
}

export function ContextChip({
    icon: Icon,
    text,
    onClick,
}: {
    icon: ComponentType<{ className?: string }>;
    text: string;
    /** When set the chip becomes a button (the editable page chip). */
    onClick?: () => void;
}) {
    const className =
        "inline-flex max-w-full items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground";
    const content = (
        <>
            <Icon className="size-3 shrink-0" />
            <span className="truncate">{text}</span>
            {onClick && (
                <ChevronDown
                    className="size-3 shrink-0 opacity-70"
                    aria-hidden="true"
                />
            )}
        </>
    );

    if (onClick) {
        return (
            <button
                type="button"
                className={cn(className, "transition-colors active:bg-accent")}
                onClick={onClick}
            >
                {content}
            </button>
        );
    }

    return <span className={className}>{content}</span>;
}
