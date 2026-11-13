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
        const cleanups: Array<() => Promise<void>> = [];
        const batcher = createRealtimeEventBatcher(
            (event) => dispatchRealtimeEvent(event),
            (key) => {
                void queryClient.invalidateQueries({ queryKey: key });
            },
        );

        const keep = (unsubscribe: () => Promise<void>) => {
            // The listener may resolve after logout/unmount: close it then
            // instead of leaving a subscription behind.
            if (disposed) void unsubscribe();
            else cleanups.push(unsubscribe);
        };

        for (const collection of REALTIME_COLLECTIONS) {
            void pb
                .collection(collection)
                .subscribe("*", (event) => {
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
                .then(keep)
                .catch((error) => {
                    // One unreadable collection must not take the others down.
                    console.warn(
                        `Realtime subscribe failed: ${collection}`,
                        error,
                    );
                });
        }

        // The SDK reconnects and re-subscribes by itself, but events sent
        // while the socket was down are lost; a full invalidation catches up.
        const catchUp = () => {
            batcher.addKeys(ALL_REALTIME_INVALIDATION_KEYS);
        };
        window.addEventListener("online", catchUp);

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
        };
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            disposed = true;
            window.removeEventListener("online", catchUp);
            document.removeEventListener("visibilitychange", onVisibility);
            batcher.dispose();
            for (const cleanup of cleanups) void cleanup();
        };
    }, [queryClient, status, userId]);
}
