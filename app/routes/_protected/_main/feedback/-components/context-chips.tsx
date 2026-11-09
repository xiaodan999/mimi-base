import type { ComponentType } from "react";

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
}: {
    icon: ComponentType<{ className?: string }>;
    text: string;
}) {
    return (
        <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">
            <Icon className="size-3 shrink-0" />
            <span className="truncate">{text}</span>
        </span>
    );
}
