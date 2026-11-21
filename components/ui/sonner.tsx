"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";

import { useTheme } from "@/lib/theme";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
    const { resolvedTheme } = useTheme();

    return (
        <Sonner
            theme={resolvedTheme}
            position="top-center"
            offset="calc(1rem + env(safe-area-inset-top))"
            className="toaster group"
            // Sonner v2 paints its toasts from these variables in an
            // unlayered stylesheet, so map them to the app's HSL tokens
            // instead of fighting it with Tailwind classes.
            style={
                {
                    "--normal-bg": "hsl(var(--popover))",
                    "--normal-text": "hsl(var(--popover-foreground))",
                    "--normal-border": "hsl(var(--border))",
                    "--border-radius": "var(--radius-lg)",
                } as CSSProperties
            }
            toastOptions={{
                classNames: {
                    actionButton:
                        "!bg-primary !text-primary-foreground active:opacity-80",
                    cancelButton:
                        "!bg-muted !text-muted-foreground active:opacity-80",
                },
            }}
            {...props}
        />
    );
};

export { Toaster };
