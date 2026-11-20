import type { InfiniteData } from "@tanstack/react-query";

import type { PostData } from "@/lib/pb-types";

/** One page of the home feed's infinite query. */
export type PostsPage = {
    posts: PostData[];
    nextPage: number | null;
    total: number;
};

export type PostsData = InfiniteData<PostsPage, number>;

/**
 * Update one post in every loaded feed page, preserving the identity of
 * pages/posts that did not change. Used by the optimistic like rollback and
 * the realtime counter patches so neither has to refetch all pages.
 */
export function patchPostInPages(
    data: PostsData | undefined,
    postId: string,
    update: (post: PostData) => PostData,
): PostsData | undefined {
    if (!data) return data;
    let changed = false;
    const pages = data.pages.map((page) => {
        let pageChanged = false;
        const posts = page.posts.map((post) => {
            if (post.id !== postId) return post;
            const next = update(post);
            if (next !== post) pageChanged = true;
            return next;
        });
        if (!pageChanged) return page;
        changed = true;
        return { ...page, posts };
    });
    return changed ? { ...data, pages } : data;
}
