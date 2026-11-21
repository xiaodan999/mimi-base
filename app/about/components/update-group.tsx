import type { LucideIcon } from "lucide-react";

export default function UpdateGroup({
    title,
    icon: Icon,
    items,
}: {
    title: string;
    icon: LucideIcon;
    items?: string[];
}) {
    if (!items?.length) return null;
    return (
        <div className="mt-3">
            <p className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Icon aria-hidden="true" className="size-3" />
                {title} · {items.length}
            </p>
            <ul className="mt-1.5 space-y-1">
                {items.map((item) => (
                    <li key={item} className="flex gap-2 text-xs leading-5">
                        <span
                            aria-hidden="true"
                            className="mt-[7px] size-1 shrink-0 rounded-full bg-primary/60"
                        />
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
