import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
    className?: string;
};

export default function ThemeToggle({ className }: ThemeToggleProps) {
    const { resolvedTheme, toggle } = useTheme();
    const isDark = resolvedTheme === "dark";

    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
            className={cn(
                "grid size-9 place-items-center rounded-full border border-border/60 bg-card/70 text-muted-foreground transition-colors hover:text-foreground active:scale-95",
                className,
            )}
        >
            {isDark ? (
                <Sun className="size-4" aria-hidden="true" />
            ) : (
                <Moon className="size-4" aria-hidden="true" />
            )}
        </button>
    );
}
