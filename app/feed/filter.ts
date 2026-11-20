/**
 * Which posts the feed shows. Every set field is ANDed by `buildFilter`, so a
 * deep link can combine a month with a search or a single post.
 */
export type PostFilter = {
    /** "YYYY-MM" — show only that month. */
    month?: string;
    /** Case-insensitive text search over the post body. */
    q?: string;
    /** Show only this post (deep link from the interaction inbox). */
    post?: string;
};

/**
 * Stable cache-key suffix for a feed filter.
 *
 * Every dimension `buildFilter` ANDs must be in the key. Keeping only the
 * first truthy value let `/home?month=2026-11&q=约会` reuse the cached
 * month-only feed (and vice versa). Values are percent-encoded so a free-text
 * query cannot spell another field.
 */
export function postFilterKey(filter: PostFilter = {}) {
    const parts: string[] = [];
    if (filter.post) parts.push(`post:${encodeURIComponent(filter.post)}`);
    if (filter.month) parts.push(`month:${encodeURIComponent(filter.month)}`);
    if (filter.q) parts.push(`q:${encodeURIComponent(filter.q)}`);
    return parts.length ? parts.join("&") : "latest";
}
