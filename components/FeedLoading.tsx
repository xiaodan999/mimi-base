import { LoadingSpinner } from "@/components/ui/loading-spinner";

/**
 * X-style first-load state: one centered spinner instead of fake cards.
 *
 * A generic skeleton can never match the real post heights, so the swap to
 * the feed read as a layout jump. A spinner says "loading" without implying
 * a card shape, and it disappears without moving anything else.
 */
export function FeedLoading() {
    return (
        <div
            role="status"
            aria-label="动态加载中"
            className="flex items-center justify-center py-10 text-primary"
        >
            <LoadingSpinner size={28} />
        </div>
    );
}
