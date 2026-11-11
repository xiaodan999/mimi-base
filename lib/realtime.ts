import { qk } from "@/lib/query-keys";

/**
 * Realtime → React Query mapping.
 *
 * PocketBase pushes record events over SSE; `useRealtimeSync` subscribes once
 * for the whole protected shell. This module stays free of React so the
 * mapping, dedupe and batching rules can be unit-tested.
 */

export type RealtimeQueryKey = readonly unknown[];

/**
 * Collections whose changes are visible in the app. Subscribing requires the
 * collection's list/view rule to allow the signed-in user, which every data
 * collection does.
 *
 * `chat_messages` is included on purpose: another device/tab of the same
 * account can write messages, and the thread query should reconcile. The
 * live draft of a running assistant reply is kept in the run store, not in
 * this query cache, so invalidation cannot drop streamed text.
 */
export const REALTIME_COLLECTIONS = [
    "ji_zhang_biao",
    "ji_zhang_category",
    "posts",
    "comments",
    "post_likes",
    "notifications",
    "study_progress",
    "dinner_options",
    "tou_xiang_circle",
    "chat_conversations",
    "chat_messages",
    "chat_personas",
    "chat_memories",
    "feedback_reports",
] as const;

export type RealtimeCollection = (typeof REALTIME_COLLECTIONS)[number];

const EMPTY: readonly RealtimeQueryKey[] = [];

/**
 * Query prefixes to invalidate for one collection. All of them are
 * `qk.*.all`-style prefixes, so one event refreshes every cached variant
 * (feed filters, expense ranges, per-conversation thread, ...) instead of
 * each page subscribing to PocketBase on its own.
 */
const INVALIDATIONS: Record<RealtimeCollection, readonly RealtimeQueryKey[]> = {
    ji_zhang_biao: [qk.jiZhang.all, qk.homeStats.all, qk.yearReportAll],
    ji_zhang_category: [qk.jiZhang.all, qk.yearReportAll],
    posts: [qk.posts.all, qk.homeStats.all, qk.yearReportAll],
    comments: [qk.comments.root, qk.posts.all],
    post_likes: [qk.posts.all],
    notifications: [qk.notifications.all],
    study_progress: [qk.studyProgressAll, qk.studySummariesAll],
    dinner_options: [qk.dinner.all],
    tou_xiang_circle: [qk.circles.all],
    chat_conversations: [qk.chat.conversationsAll, qk.chat.conversationAll],
    chat_messages: [qk.chat.messagesAll, qk.chat.conversationsAll],
    chat_personas: [qk.chat.personasAll],
    chat_memories: [qk.chat.memoriesAll],
    // A suggestion from the other account appears in 大家的建议 without a
    // reload; the same prefix refreshes the bug tab's owner-only list.
    feedback_reports: [qk.feedback.all],
};

/** Keys to invalidate for a collection name; unknown names are ignored. */
export function realtimeInvalidationKeys(
    collection: string,
): readonly RealtimeQueryKey[] {
    return INVALIDATIONS[collection as RealtimeCollection] ?? EMPTY;
}

/** Stable identity for a query key (arrays compare by value here). */
export function queryKeyFingerprint(key: RealtimeQueryKey): string {
    return JSON.stringify(key);
}

/** Preserve first-seen order while dropping value-equal keys. */
export function dedupeQueryKeys(
    keys: readonly RealtimeQueryKey[],
): RealtimeQueryKey[] {
    const seen = new Set<string>();
    const out: RealtimeQueryKey[] = [];
    for (const key of keys) {
        const fingerprint = queryKeyFingerprint(key);
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        out.push(key);
    }
    return out;
}

/** Every prefix the sync layer can touch, used for reconnect catch-up. */
export const ALL_REALTIME_INVALIDATION_KEYS: readonly RealtimeQueryKey[] =
    dedupeQueryKeys(
        REALTIME_COLLECTIONS.flatMap((collection) => [
            ...INVALIDATIONS[collection],
        ]),
    );

export type InvalidationBatcher = {
    /** Queue prefixes; duplicates collapse into the current batch. */
    add(keys: readonly RealtimeQueryKey[]): void;
    /** Run the queued invalidations immediately. */
    flush(): void;
    /** Drop queued work (unmount/logout) so no late invalidation fires. */
    dispose(): void;
    pendingCount(): number;
};

/**
 * Coalesce a burst of record events (a category delete clears several rows,
 * a chat run writes several messages) into one invalidation per prefix.
 */
export function createInvalidationBatcher(
    invalidate: (key: RealtimeQueryKey) => void,
    delay = 120,
): InvalidationBatcher {
    const pending = new Map<string, RealtimeQueryKey>();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
        if (pending.size === 0) return;
        const keys = [...pending.values()];
        pending.clear();
        for (const key of keys) invalidate(key);
    };

    return {
        add(keys) {
            for (const key of keys) {
                pending.set(queryKeyFingerprint(key), key);
            }
            if (timer === null) timer = setTimeout(flush, delay);
        },
        flush,
        dispose() {
            if (timer !== null) clearTimeout(timer);
            timer = null;
            pending.clear();
        },
        pendingCount() {
            return pending.size;
        },
    };
}
