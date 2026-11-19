import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth";
import pb from "@/lib/pb";
import {
    ALL_REALTIME_INVALIDATION_KEYS,
    createRealtimeEventBatcher,
    dispatchRealtimeEvent,
    parseRealtimeAction,
    REALTIME_COLLECTIONS,
} from "@/lib/realtime";

/** Backgrounded for longer than this: refetch even if SSE still claims up. */
const RESUMED_AFTER_MS = 30_000;

/**
 * One PocketBase realtime subscription for the whole signed-in shell.
 *
 * Mounted by `_main`, so logout unmounts it and closes every subscription;
 * login mounts it again. Record events go through the reducer registry first
 * (a page can patch its own cache in place); anything unclaimed invalidates
 * the collection's query prefixes. On reconnect / a long background pause it
 * marks all app data stale, because PocketBase does not replay events missed
 * while the SSE connection was down.
 */
export function useRealtimeSync() {
    const queryClient = useQueryClient();
    const { status, user } = useAuth();
    const userId = user?.id ?? "";

    useEffect(() => {
        if (status !== "authenticated" || !userId) return;

        let disposed = false;
        const cleanups = new Map<string, () => Promise<void>>();
        /** Subscriptions whose first connect failed; retried on reconnect. */
        const failed = new Set<string>();
        /** Subscribes that have not resolved or rejected yet. */
        const pending = new Set<string>();
        const batcher = createRealtimeEventBatcher(
            (event) => dispatchRealtimeEvent(event),
            (key) => {
                void queryClient.invalidateQueries({ queryKey: key });
            },
        );

        const subscribe = (collection: string) => {
            pending.add(collection);
            void pb
                .collection(collection)
                .subscribe("*", (event) => {
                    // A listener left behind by a rejected connection can
                    // resolve later; never let it patch the next session.
                    if (disposed) return;
                    const action = parseRealtimeAction(event?.action);
                    const record = event?.record;
                    if (!action || !record || typeof record !== "object") {
                        return;
                    }
                    batcher.add({
                        collection,
                        action,
                        record: record as Record<string, unknown>,
                    });
                })
                .then((unsubscribe) => {
                    pending.delete(collection);
                    failed.delete(collection);
                    // The listener may resolve after logout/unmount: close it
                    // then instead of leaving a subscription behind.
                    if (disposed) void unsubscribe();
                    else cleanups.set(collection, unsubscribe);
                })
                .catch((error) => {
                    pending.delete(collection);
                    if (!disposed) failed.add(collection);
                    // One unreadable collection must not take the others down.
                    console.warn(
                        `Realtime subscribe failed: ${collection}`,
                        error,
                    );
                });
        };

        for (const collection of REALTIME_COLLECTIONS) subscribe(collection);

        /**
         * The SDK reconnects an established socket by itself, but a first
         * connect that failed (app opened offline) is never retried: every
         * `subscribe()` rejected and no client id exists yet. Drop the
         * listener the rejected call left in the SDK, then subscribe again.
         */
        const retryFailed = () => {
            if (disposed || failed.size === 0) return;
            const collections = [...failed];
            failed.clear();
            for (const collection of collections) {
                void pb
                    .collection(collection)
                    .unsubscribe("*")
                    .catch(() => {})
                    .then(() => {
                        if (!disposed) subscribe(collection);
                    });
            }
        };

        // The SDK reconnects and re-subscribes by itself, but events sent
        // while the socket was down are lost; a full invalidation catches up.
        const catchUp = () => {
            batcher.addKeys(ALL_REALTIME_INVALIDATION_KEYS);
        };

        // `PB_CONNECT` fires on the first connection and on every silent SDK
        // reconnect (server restart, dropped stream). The first one is the
        // page's own startup fetch, so only later ones need a catch-up.
        let connectedOnce = false;
        void pb.realtime
            .subscribe("PB_CONNECT", () => {
                if (disposed) return;
                retryFailed();
                if (connectedOnce) catchUp();
                connectedOnce = true;
            })
            .catch(() => {
                // The online/visibility retries re-establish the collections;
                // an established reconnect will still fire PB_CONNECT because
                // the SDK kept this listener.
            });

        const onOnline = () => {
            catchUp();
            retryFailed();
        };
        window.addEventListener("online", onOnline);
        window.addEventListener("focus", retryFailed);

        let hiddenAt = 0;
        const onVisibility = () => {
            if (document.visibilityState === "hidden") {
                hiddenAt = Date.now();
                return;
            }
            const away = hiddenAt ? Date.now() - hiddenAt : 0;
            hiddenAt = 0;
            if (!pb.realtime.isConnected || away >= RESUMED_AFTER_MS) {
                catchUp();
            }
            retryFailed();
        };
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            disposed = true;
            window.removeEventListener("online", onOnline);
            window.removeEventListener("focus", retryFailed);
            document.removeEventListener("visibilitychange", onVisibility);
            batcher.dispose();
            void pb.realtime.unsubscribe("PB_CONNECT").catch(() => {});
            for (const unsubscribe of cleanups.values()) void unsubscribe();
            // A rejected or still-pending subscribe left its listener inside
            // the SDK; remove those topics before the next session subscribes.
            for (const collection of new Set([...failed, ...pending])) {
                void pb
                    .collection(collection)
                    .unsubscribe("*")
                    .catch(() => {});
            }
        };
    }, [queryClient, status, userId]);
}
