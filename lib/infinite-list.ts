/** Reads the rows a list paints out of one infinite-query page. */
export type PageItems<TPage, TItem> = (page: TPage) => readonly TItem[];

/**
 * Flatten an infinite-query page window in load order.
 *
 * `uniqueBy` drops rows offset paging repeats after an insert (the feedback
 * lists rely on it); the first occurrence wins.
 */
export function flattenInfinitePages<TPage, TItem>(
    data: { pages: readonly TPage[] } | undefined,
    select: PageItems<TPage, TItem>,
    uniqueBy?: (item: TItem) => string,
): TItem[] {
    if (!data) return [];
    const items = data.pages.flatMap((page) => select(page));
    if (!uniqueBy) return items;

    const seen = new Set<string>();
    return items.filter((item) => {
        const key = uniqueBy(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
