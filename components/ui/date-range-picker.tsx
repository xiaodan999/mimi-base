"use client";

import * as React from "react";
import { addDays, format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { zhCN } from "date-fns/esm/locale";

type DatePickerWithRangeProps = {
    date: DateRange;
    onSelectDate: (value: DateRange) => void;
} & React.HTMLAttributes<HTMLDivElement>;
export function DatePickerWithRange({
    className,
    date,
    onSelectDate = (value) => {},
}: DatePickerWithRangeProps) {
    return (
        <div className={cn("grid gap-2", className)}>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        id="date"
                        variant={"outline"}
                        className={cn(
                            "w-[300px] justify-start text-left font-normal",
                            !date && "text-muted-foreground",
                        )}
                    >
                        <CalendarIcon />
                        {date?.from ? (
                            date.to ? (
                                <>
                                    {format(date.from, "yyyy年MM月dd日")} -{" "}
                                    {format(date.to, "yyyy年MM月dd日")}
                                </>
                            ) : (
                                format(date.from, "yyyy年MM月dd日")
                            )
                        ) : (
                            <span>Pick a date</span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={date?.from}
                        selected={date}
                        onSelect={(value) => {
                            onSelectDate(value!);
                        }}
                        numberOfMonths={2}
                        locale={zhCN}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
}
