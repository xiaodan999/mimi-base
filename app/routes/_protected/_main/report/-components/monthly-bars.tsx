import { cn } from "@/lib/utils";

export default function MonthlyBars({
    values,
    format,
}: {
    values: number[];
    format: (value: number) => string;
}) {
    const max = Math.max(1, ...values);

    return (
        <div
            role="img"
            aria-label={`每月支出：${values
                .map((value, index) => `${index + 1} 月 ${format(value)}`)
                .join("，")}`}
            className="mt-3 flex h-24 items-stretch gap-1"
        >
            {values.map((value, index) => (
                <div
                    key={index}
                    className="flex min-w-0 flex-1 flex-col items-center"
                >
                    <div className="relative w-full flex-1">
                        <div
                            aria-hidden="true"
                            className={cn(
                                "absolute inset-x-0 bottom-0 mx-auto max-w-6 rounded-t-md",
                                value > 0 ? "bg-primary/55" : "bg-muted",
                            )}
                            style={{
                                height:
                                    value > 0
                                        ? `${Math.max(8, (value / max) * 100)}%`
                                        : "3px",
                            }}
                        />
                    </div>
                    <span className="mt-1 text-[9px] text-muted-foreground">
                        {index + 1}
                    </span>
                </div>
            ))}
        </div>
    );
}
