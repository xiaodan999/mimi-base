import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";

import { cn } from "@/lib/utils";

import { useUnreadNotificationCount } from "../data";

export default function NotificationBell({
    className,
}: {
    className?: string;
}) {
    const { data: unread = 0 } = useUnreadNotificationCount();
    const label =
        unread > 0 ? `互动消息，${unread} 条未读` : "互动消息，暂无未读";

    return (
        <Link
            to="/notifications"
            aria-label={label}
            className={cn(
                "relative grid size-9 shrink-0 place-items-center rounded-full border border-border/60 bg-card/70 text-muted-foreground transition-colors hover:text-foreground active:scale-95",
                className,
            )}
        >
            <Bell className="size-4" aria-hidden="true" />
            {unread > 0 && (
                <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full border-2 border-card bg-primary px-0.5 text-[9px] leading-none font-bold text-primary-foreground"
                >
                    {unread > 9 ? "9+" : unread}
                </span>
            )}
        </Link>
    );
}
