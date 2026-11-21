import type { LucideIcon } from "lucide-react";
import {
    createContext,
    type KeyboardEvent,
    type ReactNode,
    useContext,
    useId,
    useRef,
} from "react";

import { cn } from "@/lib/utils";

type TabsContextValue = {
    value: string;
    onValueChange: (value: string) => void;
    baseId: string;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
    const context = useContext(TabsContext);
    if (!context) {
        throw new Error(`${component} must be used inside <Tabs>`);
    }
    return context;
}

type TabsProps = {
    value: string;
    onValueChange: (value: string) => void;
    /** Stable id prefix for aria-controls / aria-labelledby. */
    id?: string;
    className?: string;
    children: ReactNode;
};

/** A small segmented-control-style tab set with automatic activation. */
export function Tabs({
    value,
    onValueChange,
    id,
    className,
    children,
}: TabsProps) {
    const generatedId = useId();
    // React's useId contains colons; strip them so the id stays CSS-friendly.
    const baseId = (id ?? generatedId).replace(/:/g, "");
    return (
        <TabsContext.Provider value={{ value, onValueChange, baseId }}>
            <div className={className}>{children}</div>
        </TabsContext.Provider>
    );
}

type TabListProps = {
    /** Accessible name for the tab set. */
    label: string;
    className?: string;
    children: ReactNode;
};

export function TabList({ label, className, children }: TabListProps) {
    const listRef = useRef<HTMLDivElement>(null);

    /**
     * WAI-ARIA tabs with automatic activation: the arrow keys move focus and
     * select the tab in one step, Home/End jump to the ends.
     */
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (
            event.key !== "ArrowLeft" &&
            event.key !== "ArrowRight" &&
            event.key !== "Home" &&
            event.key !== "End"
        ) {
            return;
        }
        const tabs = Array.from(
            listRef.current?.querySelectorAll<HTMLButtonElement>(
                '[role="tab"]:not(:disabled)',
            ) ?? [],
        );
        if (tabs.length === 0) return;

        const current = tabs.indexOf(
            document.activeElement as HTMLButtonElement,
        );
        let next = current;
        if (event.key === "ArrowLeft") {
            next = current <= 0 ? tabs.length - 1 : current - 1;
        } else if (event.key === "ArrowRight") {
            next = current >= tabs.length - 1 ? 0 : current + 1;
        } else if (event.key === "Home") {
            next = 0;
        } else {
            next = tabs.length - 1;
        }

        event.preventDefault();
        const target = tabs[next];
        target.focus();
        target.click();
    };

    return (
        <div
            ref={listRef}
            role="tablist"
            aria-label={label}
            aria-orientation="horizontal"
            className={cn(
                "flex items-center gap-1 rounded-xl border border-border/60 bg-muted/40 p-1",
                className,
            )}
            onKeyDown={handleKeyDown}
        >
            {children}
        </div>
    );
}

type TabProps = {
    value: string;
    icon?: LucideIcon;
    disabled?: boolean;
    className?: string;
    children: ReactNode;
};

export function Tab({
    value,
    icon: Icon,
    disabled = false,
    className,
    children,
}: TabProps) {
    const {
        value: selected,
        onValueChange,
        baseId,
    } = useTabsContext("Tab");
    const active = selected === value;
    return (
        <button
            type="button"
            role="tab"
            id={`${baseId}-tab-${value}`}
            aria-controls={`${baseId}-panel-${value}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors active:bg-accent aria-selected:bg-card aria-selected:text-foreground aria-selected:shadow-soft disabled:pointer-events-none disabled:opacity-50",
                className,
            )}
            onClick={() => {
                if (!active) onValueChange(value);
            }}
        >
            {Icon && <Icon className="size-4" aria-hidden="true" />}
            {children}
        </button>
    );
}

type TabPanelProps = {
    value: string;
    className?: string;
    children: ReactNode;
};

export function TabPanel({ value, className, children }: TabPanelProps) {
    const { value: selected, baseId } = useTabsContext("TabPanel");
    return (
        <div
            role="tabpanel"
            id={`${baseId}-panel-${value}`}
            aria-labelledby={`${baseId}-tab-${value}`}
            hidden={selected !== value}
            className={className}
        >
            {children}
        </div>
    );
}
