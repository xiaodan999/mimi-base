import { aiUrl, chatHeaders, readChatError } from "./api";

/**
 * Client side of the server data tools (`pocketbase/ai-tools.ts`). These
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
    items?: Array<{
        id: string;
        item: string;
        price: number;
        category: string;
        created: string;
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

/** `read_attachment` mode=text: the stored attachment's extracted text. */
export type AttachmentTextResult = {
    ok: boolean;
    error?: string;
    attachmentId?: string;
    name?: string;
    kind?: "text" | "pdf";
    content?: string;
    truncated?: boolean;
    numPages?: number;
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
