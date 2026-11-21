import * as React from "react";

import { cn } from "@/lib/utils";

export interface SelectProps
    extends React.SelectHTMLAttributes<HTMLSelectElement> {}

/**
 * Styled native select. It intentionally keeps the platform dropdown (and its
 * keyboard/touch behaviour) instead of pulling in a popover-based listbox;
 * pages that need a custom menu build it themselves.
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
    ({ className, children, ...props }, ref) => {
        return (
            <select
                ref={ref}
                className={cn(
                    "h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    className,
                )}
                {...props}
            >
                {children}
            </select>
        );
    },
);
Select.displayName = "Select";

export { Select };
