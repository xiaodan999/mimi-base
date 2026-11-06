import { Skeleton } from "@/components/ui/skeleton";

function PostSkeleton() {
    return (
        <div className="flex gap-2 px-4 py-4">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/5" />
                <div className="grid max-w-[240px] grid-cols-3 gap-1 pt-1">
                    <Skeleton className="aspect-square rounded-sm" />
                    <Skeleton className="aspect-square rounded-sm" />
                    <Skeleton className="aspect-square rounded-sm" />
                </div>
                <div className="flex items-center justify-between pt-1">
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="h-4 w-16" />
                </div>
            </div>
        </div>
    );
}

/** Feed placeholder that keeps the page shape while the first page loads. */
export function FeedSkeleton() {
    return (
        <div
            className="pb-24"
            role="status"
            aria-busy="true"
            aria-label="动态加载中"
        >
            <div className="flex items-center justify-center bg-black/5 px-4 py-2">
                <Skeleton className="h-3 w-12" />
            </div>
            {[0, 1, 2].map((index) => (
                <PostSkeleton key={index} />
            ))}
        </div>
    );
}
