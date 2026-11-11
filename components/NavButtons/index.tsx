import { Link, useLocation, useRouter } from "@tanstack/react-router";
import {
    BookOpen,
    House,
    type LucideIcon,
    MessageSquareText,
    UserRound,
    Wallet,
} from "lucide-react";
import { useEffect } from "react";

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

/**
 * Warm the other tabs once per app session instead of waiting for the tap.
 * `defaultPreload: "intent"` only starts a route's chunk on touchstart, so the
 * first switch after a deploy (every hashed chunk is new) waits for the whole
 * route over the network. A module flag keeps this to one idle pass even if
 * the shell remounts.
 */
let tabsPrefetched = false;

export default function NavButtons() {
    const { pathname } = useLocation();
    const router = useRouter();

    useEffect(() => {
        if (tabsPrefetched || !import.meta.env.PROD) return;

        // Respect the phone's data-saver preference: warming four routes is a
        // deliberate bandwidth trade, not something to do against the user.
        const connection = (
            navigator as Navigator & { connection?: { saveData?: boolean } }
        ).connection;
        if (connection?.saveData) return;
        tabsPrefetched = true;

        let cancelled = false;

        const warm = () => {
            const current = router.state.location.pathname;
            for (const { path } of routes) {
                if (current === path || current.startsWith(`${path}/`))
                    continue;
                // The tap still goes through the router's preload cache; a
                // failed warm-up must never surface, and vite:preloadError
                // already handles a chunk the deploy replaced.
                void router.preloadRoute({ to: path }).catch(() => {});
            }
        };

        const idle = () => {
            if (cancelled) return;
            // Safari ships no requestIdleCallback, hence the runtime check
            // behind a cast that keeps TS from assuming it always exists.
            const requestIdle = (
                window as unknown as {
                    requestIdleCallback?: (
                        callback: () => void,
                        options?: { timeout?: number },
                    ) => number;
                }
            ).requestIdleCallback;
            if (requestIdle) {
                requestIdle.call(window, warm, { timeout: 2_000 });
            } else {
                // A delayed timeout still keeps the warm-up off the first
                // paint where idle callbacks are unavailable.
                window.setTimeout(warm, 1_200);
            }
        };

        // Do not borrow bandwidth while the first screen is still painting:
        // on /home the feed arrives after its own query, so waiting for `load`
        // is not enough. Largest-contentful-paint candidates stop updating
        // once the page has settled (the feed paragraph is the LCP on /home);
        // the hard cap keeps an endlessly changing page (or a browser without
        // LCP) from skipping the warm-up forever.
        let quietTimer: number | undefined;
        let paintCap: number | undefined;
        let paintObserver: PerformanceObserver | undefined;

        const settlePaint = () => {
            paintObserver?.disconnect();
            window.clearTimeout(quietTimer);
            window.clearTimeout(paintCap);
            idle();
        };

        const watchPaint = () => {
            if (cancelled) return;
            if (typeof PerformanceObserver === "undefined") {
                idle();
                return;
            }
            const resetQuiet = () => {
                window.clearTimeout(quietTimer);
                quietTimer = window.setTimeout(settlePaint, 1_500);
            };
            try {
                paintObserver = new PerformanceObserver(resetQuiet);
                paintObserver.observe({
                    type: "largest-contentful-paint",
                    buffered: true,
                });
            } catch {
                paintObserver?.disconnect();
                idle();
                return;
            }
            resetQuiet();
            paintCap = window.setTimeout(settlePaint, 8_000);
        };

        const onLoad = () => watchPaint();
        if (document.readyState === "complete") {
            watchPaint();
        } else {
            window.addEventListener("load", onLoad, { once: true });
        }

        return () => {
            cancelled = true;
            window.removeEventListener("load", onLoad);
            paintObserver?.disconnect();
            window.clearTimeout(quietTimer);
            window.clearTimeout(paintCap);
        };
    }, [router]);

    return (
        <nav
            aria-label="主导航"
            className="z-30 flex items-stretch gap-0.5 border-t border-border/70 bg-background/85 pr-[calc(0.375rem+env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] pl-[calc(0.375rem+env(safe-area-inset-left))] backdrop-blur-xl"
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
