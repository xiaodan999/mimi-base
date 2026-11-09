import { Link, useLocation } from "@tanstack/react-router";
import {
    BookOpen,
    House,
    MessageSquareText,
    UserRound,
    Wallet,
    type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavRoute = {
    name: string;
    path: string;
    icon: LucideIcon;
    exact?: boolean;
};

const routes: NavRoute[] = [
    { name: "首页", path: "/home", icon: House, exact: true },
    { name: "聊天", path: "/chat", icon: MessageSquareText },
    { name: "记账", path: "/jizhang", icon: Wallet },
    { name: "学习", path: "/study", icon: BookOpen },
    { name: "我的", path: "/profile", icon: UserRound },
];

export default function NavButtons() {
    const { pathname } = useLocation();

    return (
        <nav
            aria-label="主导航"
            className="z-30 flex items-stretch gap-0.5 border-t border-border/70 bg-background/85 pb-[env(safe-area-inset-bottom)] pl-[calc(0.375rem+env(safe-area-inset-left))] pr-[calc(0.375rem+env(safe-area-inset-right))] backdrop-blur-xl"
        >
            {routes.map(({ name, path, icon: Icon, exact }) => {
                const active = exact
                    ? pathname === path
                    : pathname === path || pathname.startsWith(`${path}/`);

                return (
                    <Link
                        key={path}
                        to={path}
                        aria-label={name}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                            "group flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-muted-foreground transition-colors focus-visible:bg-accent/60 active:bg-primary/10 active:text-primary",
                            active
                                ? "bg-primary/10 text-primary"
                                : "hover:text-foreground",
                        )}
                    >
                        <span className="grid h-8 w-12 place-items-center">
                            <Icon
                                className="size-[18px]"
                                strokeWidth={active ? 2.4 : 2}
                                aria-hidden="true"
                            />
                        </span>
                        <span className="text-[10px] font-semibold tracking-wide">
                            {name}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}
