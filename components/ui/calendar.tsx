"use client";

import * as React from "react";
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
} from "lucide-react";
import { DayButton, DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    ...props
}: CalendarProps) {
    return (
        <DayPicker
            showOutsideDays={showOutsideDays}
            className={cn("p-3", className)}
            classNames={{
                months: "flex flex-col gap-4 sm:flex-row",
                month: "relative flex flex-col gap-4",
                month_caption:
                    "relative flex h-7 items-center justify-center pt-1",
                caption_label: "text-sm font-medium",
                nav: "flex items-center gap-1",
                button_previous: cn(
                    buttonVariants({ variant: "outline" }),
                    "absolute left-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
                ),
                button_next: cn(
                    buttonVariants({ variant: "outline" }),
                    "absolute right-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
                ),
                month_grid: "w-full border-collapse",
                weekdays: "flex",
                weekday:
                    "text-muted-foreground w-9 rounded-md text-center text-[0.8rem] font-normal",
                weeks: "",
                week: "mt-2 flex w-full",
                day: "relative h-9 w-9 p-0 text-center text-sm",
                day_button: "h-9 w-9 p-0 font-normal",
                chevron: "h-4 w-4",
                selected: "bg-accent",
                range_start: "rounded-l-md",
                range_end: "rounded-r-md",
                range_middle: "bg-accent [&>button]:text-accent-foreground",
                today: "rounded-md bg-accent [&>button]:text-accent-foreground",
                outside:
                    "text-muted-foreground opacity-50 [&>button]:text-muted-foreground [&>button]:opacity-50",
                disabled:
                    "text-muted-foreground opacity-50 [&>button]:text-muted-foreground [&>button]:opacity-50",
                hidden: "invisible",
                ...classNames,
            }}
            components={{
                // Wrap the default button (it owns the focus effect) and paint
                // the range endpoints primary; middle cells show the band.
                DayButton: (dayButtonProps) => (
                    <DayButton
                        {...dayButtonProps}
                        className={cn(
                            buttonVariants({ variant: "ghost" }),
                            "h-9 w-9 p-0 font-normal",
                            dayButtonProps.modifiers.selected &&
                                !dayButtonProps.modifiers.range_middle &&
                                "bg-primary text-primary-foreground hover:bg-primary active:bg-primary",
                            dayButtonProps.className,
                        )}
                    />
                ),
                Chevron: ({ orientation, className: chevronClassName }) => {
                    const Icon =
                        orientation === "left"
                            ? ChevronLeft
                            : orientation === "right"
                              ? ChevronRight
                              : orientation === "up"
                                ? ChevronUp
                                : ChevronDown;
                    return (
                        <Icon className={chevronClassName} aria-hidden="true" />
                    );
                },
            }}
            {...props}
        />
    );
}
Calendar.displayName = "Calendar";

export { Calendar };
