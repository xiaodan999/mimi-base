import type { ReactNode } from "react";

export default function Row({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className="flex min-w-0 items-center gap-1 text-right">
                {children}
            </dd>
        </div>
    );
}
