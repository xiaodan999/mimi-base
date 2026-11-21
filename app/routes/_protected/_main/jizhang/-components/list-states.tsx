import { Wallet } from "lucide-react";

import { EmptyState as SharedEmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";

export function EmptyState() {
    return (
        <SharedEmptyState
            className="px-6 py-12"
            description="换个日期看看，或者从右上角记一笔。"
            icon={<Wallet className="size-6" aria-hidden="true" />}
            title="这段时间没有记录"
        />
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
