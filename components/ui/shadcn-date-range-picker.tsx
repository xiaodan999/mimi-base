"use client";

import * as React from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import { DateRange } from "react-day-picker";

import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Button } from "./button";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "./calendar";

export default function CalendarDateRangePicker({
    className,
    date,
    onRangeChange,
    compact = false,
}: {
    date: DateRange | undefined;
    onRangeChange: (range: DateRange | undefined) => void;
    /** Fits the trigger into a dense header row. */
    compact?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
    const isDesktop = useMediaQuery("(min-width: 768px)");

    return (
        <div className={cn("grid gap-2", className)}>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        id="date"
                        variant={"outline"}
                        size={compact ? "sm" : "default"}
                        className={cn(
                            compact
                                ? "h-8 gap-1.5 rounded-full px-3 text-xs font-medium"
                                : "w-[240px] justify-start text-left font-normal",
                            !date && "text-muted-foreground",
                        )}
                    >
                        <CalendarIcon
                            className={compact ? "size-3.5" : "mr-2 h-4 w-4"}
                        />
                        {date?.from ? (
                            date.to ? (
                                <>
                                    {format(
                                        date.from,
                                        compact ? "M月d日" : "yyyy/M/d",
                                        { locale: zhCN },
                                    )}{" "}
                                    -{" "}
                                    {format(
                                        date.to,
                                        compact ? "M月d日" : "yyyy/M/d",
                                        { locale: zhCN },
                                    )}
                                </>
                            ) : (
                                format(
                                    date.from,
                                    compact ? "M月d日" : "yyyy/M/d",
                                    { locale: zhCN },
                                )
                            )
                        ) : (
                            <span>选择日期</span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                        initialFocus
                        locale={zhCN}
                        mode="range"
                        defaultMonth={date?.from}
                        selected={date}
                        onSelect={(range) => {
                            onRangeChange(range);
                        }}
                        numberOfMonths={isDesktop ? 2 : 1}
                        disabled={{ after: new Date() }}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
}
