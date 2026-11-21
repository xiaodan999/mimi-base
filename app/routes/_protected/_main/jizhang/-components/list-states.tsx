import { Wallet } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

export function EmptyState() {
    return (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/70 bg-card/60 px-6 py-12 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
                <Wallet className="size-6" aria-hidden="true" />
            </span>
            <h3 className="mt-3 text-sm font-semibold">这段时间没有记录</h3>
            <p className="mt-1 text-xs text-muted-foreground">
                换个日期看看，或者从右上角记一笔。
            </p>
        </div>
    );
}

export function JiZhangSkeleton() {
    return (
        <div className="grid gap-3" aria-busy="true" aria-label="账目加载中">
            {[0, 1].map((index) => (
                <div
                    key={index}
                    className="rounded-2xl border border-border/60 bg-card p-4 shadow-soft"
                >
                    <div className="mb-4 flex items-center justify-between">
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-4 w-20" />
                    </div>
                    <div className="space-y-3">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                </div>
            ))}
        </div>
    );
}
