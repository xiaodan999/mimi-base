import type { InfiniteData } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { flattenInfinitePages, type PageItems } from "@/lib/infinite-list";

/** The slice of a `useInfiniteQuery` result a list renderer reads. */
export type InfiniteListQuery<TPage> = {
    data: InfiniteData<TPage> | undefined;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => unknown;
};

export type InfiniteList<TItem> = {
    items: TItem[];
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    loadMore: () => void;
};

/**
 * Flatten an infinite query for a list view and derive the load-more action.
 *
 * `select` should be a module-level function (or otherwise stable) so the
 * flattened rows keep their identity between unrelated renders. `loadMore`
 * guards against a second page request while one is in flight.
 */
export function useInfiniteList<TPage, TItem>(
    query: InfiniteListQuery<TPage>,
    select: PageItems<TPage, TItem>,
    options?: { uniqueBy?: (item: TItem) => string },
): InfiniteList<TItem> {
    const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = query;
    const uniqueBy = options?.uniqueBy;
    const items = useMemo(
        () => flattenInfinitePages(data, select, uniqueBy),
        [data, select, uniqueBy],
    );
    const loadMore = useCallback(() => {
        if (!hasNextPage || isFetchingNextPage) return;
        void fetchNextPage();
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

    return { items, hasNextPage, isFetchingNextPage, loadMore };
}
