import { aiUrl, chatHeaders, readChatError } from "./api";

/**
 * Client side of the server data tools (`server/ai-tools.ts`). These
 * endpoints authenticate with the PocketBase token and enforce their own
 * scoping and limits server-side; the browser never queries another user's
 * data and never constructs filters.
 */
export async function postTool<T>(
    path: string,
    body: Record<string, unknown>,
): Promise<T> {
    const res = await fetch(aiUrl(path), {
        method: "POST",
        headers: chatHeaders(),
        body: JSON.stringify(body),
    });
    if (!res.ok) throw await readChatError(res);
    return (await res.json()) as T;
}

export type ExpensesToolResult = {
    ok: boolean;
    error?: string;
    range?: { from: string; to: string };
    count?: number;
    truncated?: boolean;
    total?: number;
    byCategory?: Record<string, number>;
    /** Per-person totals over the range, biggest spender first. `avatar` is
     * the users.tou_xiang filename; the client renders profile chips from
     * id + avatar with a tokened URL (same as the feed). */
    people?: Array<{
        id: string;
        name: string;
        avatar: string;
        mine: boolean;
        total: number;
        count: number;
    }>;
    items?: Array<{
        id: string;
        item: string;
        price: number;
        category: string;
        created: string;
        /** Display name of who logged the expense (我 / 对方 fallback). */
        by: string;
        mine: boolean;
    }>;
};

export type PostsToolResult = {
    ok: boolean;
    error?: string;
    query?: string;
    count?: number;
    items?: Array<{
        id: string;
        text: string;
        created: string;
        images: number;
        likes: number;
        comments: number;
        /** users record id + tou_xiang filename for the author chip. */
        authorId: string;
        avatar: string;
        /** Display name of the author (我 / 对方 fallback). */
        by: string;
        mine: boolean;
    }>;
};

export type CommentsToolResult = {
    ok: boolean;
    error?: string;
    postId?: string;
    query?: string;
    author?: string;
    limit?: number;
    count?: number;
    truncated?: boolean;
    items?: Array<{
        id: string;
        /** Comment text, truncated server-side to a safe context size. */
        text: string;
        created: string;
        images: number;
        /** Parent comment id when this comment is a reply. */
        parentId: string;
        /** Display name of the parent comment's author (回复 @谁). */
        replyTo: string;
        /** Post the comment belongs to, with its text as context. */
        postId: string;
        postText: string;
        /** users record id + tou_xiang filename for the author chip. */
        authorId: string;
        avatar: string;
        /** Display name of the commenter (我 / 对方 fallback). */
        by: string;
        mine: boolean;
    }>;
};

export type MemoryToolResult = {
    ok: boolean;
    error?: string;
    items?: Array<{ id: string; content: string; created: string }>;
    saved?: boolean;
    deleted?: boolean;
    id?: string;
    content?: string;
};

export type ReadUrlToolResult = {
    ok: boolean;
    error?: string;
    url?: string;
    contentType?: string;
    title?: string;
    text?: string;
    truncated?: boolean;
};

/** `read_attachment` mode=pages; the images themselves ride in resultImages. */
export type AttachmentPagesResult = {
    ok: boolean;
    error?: string;
    attachmentId?: string;
    name?: string;
    pages?: number[];
    numPages?: number;
};

/** The browser's timezone offset (`getTimezoneOffset()`), for day ranges. */
export function timezoneOffsetMinutes(): number {
    return new Date().getTimezoneOffset();
}
