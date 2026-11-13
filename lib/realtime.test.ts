import { afterEach, describe, expect, test } from "bun:test";

import { qk } from "./query-keys";
import {
    ALL_REALTIME_INVALIDATION_KEYS,
    clearRealtimeReducers,
    createRealtimeEventBatcher,
    dedupeQueryKeys,
    dispatchRealtimeEvent,
    parseRealtimeAction,
    queryKeyFingerprint,
    REALTIME_COLLECTIONS,
    type RealtimeEvent,
    realtimeInvalidationKeys,
    type RealtimeQueryKey,
    registerRealtimeReducer,
} from "./realtime";

describe("realtimeInvalidationKeys", () => {
    test("maps shared ledger and category writes to every ledger surface", () => {
        expect(realtimeInvalidationKeys("ji_zhang_biao")).toEqual([
            qk.jiZhang.all,
            qk.homeStats.all,
            qk.yearReportAll,
        ]);
        expect(realtimeInvalidationKeys("ji_zhang_category")).toEqual([
            qk.jiZhang.all,
            qk.yearReportAll,
        ]);
    });

    test("maps feed writes to feed, home stats and the year report", () => {
        expect(realtimeInvalidationKeys("posts")).toEqual([
            qk.posts.all,
            qk.homeStats.all,
            qk.yearReportAll,
        ]);
        expect(realtimeInvalidationKeys("comments")).toEqual([
            qk.comments.root,
            qk.posts.all,
        ]);
        expect(realtimeInvalidationKeys("post_likes")).toEqual([qk.posts.all]);
        expect(realtimeInvalidationKeys("notifications")).toEqual([
            qk.notifications.all,
        ]);
        expect(REALTIME_COLLECTIONS).toContain("notifications");
    });

    test("maps study progress to both the editor and the overview", () => {
        expect(realtimeInvalidationKeys("study_progress")).toEqual([
            qk.studyProgressAll,
            qk.studySummariesAll,
        ]);
    });

    test("keeps a feedback fallback while the page owns the detailed patch", () => {
        // `/feedback` registers a reducer while it is open; with the page
        // closed the prefix invalidation is still the safety net.
        expect(realtimeInvalidationKeys("feedback_reports")).toEqual([
            qk.feedback.all,
        ]);
        expect(REALTIME_COLLECTIONS).toContain("feedback_reports");
    });

    test("ignores collections the app does not read", () => {
        expect(realtimeInvalidationKeys("tu_pian_xin_xi")).toEqual([]);
        expect(realtimeInvalidationKeys("")).toEqual([]);
    });

    test("subscribes each collection at most once", () => {
        expect(new Set(REALTIME_COLLECTIONS).size).toBe(
            REALTIME_COLLECTIONS.length,
        );
    });
});

describe("dedupeQueryKeys", () => {
    test("drops value-equal keys but keeps distinct variants", () => {
        const keys: RealtimeQueryKey[] = [
            ["posts", "u1", "latest"],
            ["posts", "u1", "latest"],
            ["posts", "u1", "month:2026-11"],
            ["posts"],
        ];
        expect(dedupeQueryKeys(keys)).toEqual([
            ["posts", "u1", "latest"],
            ["posts", "u1", "month:2026-11"],
            ["posts"],
        ]);
    });

    test("fingerprints are stable for equal key paths", () => {
        expect(queryKeyFingerprint(["a", 1, "b"])).toBe(
            queryKeyFingerprint(["a", 1, "b"]),
        );
        expect(queryKeyFingerprint(["a", 1])).not.toBe(
            queryKeyFingerprint(["a", 1, "b"]),
        );
    });
});

describe("ALL_REALTIME_INVALIDATION_KEYS", () => {
    test("covers every mapped prefix exactly once", () => {
        const fingerprints =
            ALL_REALTIME_INVALIDATION_KEYS.map(queryKeyFingerprint);
        expect(new Set(fingerprints).size).toBe(fingerprints.length);

        for (const collection of REALTIME_COLLECTIONS) {
            for (const key of realtimeInvalidationKeys(collection)) {
                expect(fingerprints).toContain(queryKeyFingerprint(key));
            }
        }
        expect(fingerprints).toContain(queryKeyFingerprint(qk.posts.all));
        expect(fingerprints).toContain(queryKeyFingerprint(qk.jiZhang.all));
        expect(fingerprints).toContain(
            queryKeyFingerprint(qk.studySummariesAll),
        );
    });
});

describe("parseRealtimeAction", () => {
    test("accepts PocketBase actions and drops anything else", () => {
        expect(parseRealtimeAction("create")).toBe("create");
        expect(parseRealtimeAction("update")).toBe("update");
        expect(parseRealtimeAction("delete")).toBe("delete");
        expect(parseRealtimeAction("")).toBeNull();
        expect(parseRealtimeAction(undefined)).toBeNull();
    });
});

describe("registerRealtimeReducer", () => {
    afterEach(() => clearRealtimeReducers());

    test("dispatches only to the collection's reducers", () => {
        const seen: RealtimeEvent[] = [];
        registerRealtimeReducer("feedback_reports", (event) => {
            seen.push({ collection: "feedback_reports", ...event });
            return true;
        });

        const handled = dispatchRealtimeEvent({
            collection: "feedback_reports",
            action: "update",
            record: { id: "r1" },
        });

        expect(handled).toBe(true);
        expect(seen).toEqual([
            {
                collection: "feedback_reports",
                action: "update",
                record: { id: "r1" },
            },
        ]);
    });

    test("reports an unhandled collection so the caller invalidates", () => {
        expect(
            dispatchRealtimeEvent({
                collection: "posts",
                action: "create",
                record: { id: "p1" },
            }),
        ).toBe(false);
    });

    test("unregister stops delivery", () => {
        let calls = 0;
        const off = registerRealtimeReducer("feedback_reports", () => {
            calls += 1;
            return true;
        });
        off();
        expect(
            dispatchRealtimeEvent({
                collection: "feedback_reports",
                action: "delete",
                record: { id: "r1" },
            }),
        ).toBe(false);
        expect(calls).toBe(0);
    });

    test("a throwing reducer does not stop the others", () => {
        registerRealtimeReducer("feedback_reports", () => {
            throw new Error("boom");
        });
        let handled = false;
        registerRealtimeReducer("feedback_reports", () => {
            handled = true;
            return true;
        });

        const originalWarn = console.warn;
        console.warn = () => {};
        try {
            expect(
                dispatchRealtimeEvent({
                    collection: "feedback_reports",
                    action: "update",
                    record: { id: "r1" },
                }),
            ).toBe(true);
        } finally {
            console.warn = originalWarn;
        }
        expect(handled).toBe(true);
    });
});

describe("createRealtimeEventBatcher", () => {
    afterEach(() => clearRealtimeReducers());

    test("collapses a burst into one invalidation per prefix", () => {
        const seen: RealtimeQueryKey[] = [];
        const batcher = createRealtimeEventBatcher(
            () => false,
            (key) => seen.push(key),
            10_000,
        );

        batcher.add({
            collection: "posts",
            action: "update",
            record: { id: "p1" },
        });
        batcher.add({
            collection: "posts",
            action: "update",
            record: { id: "p2" },
        });
        expect(batcher.pendingCount()).toBe(2);

        batcher.flush();
        expect(seen).toEqual([
            qk.posts.all,
            qk.homeStats.all,
            qk.yearReportAll,
        ]);
        expect(batcher.pendingCount()).toBe(0);

        // A second flush with nothing queued is a no-op.
        batcher.flush();
        expect(seen.length).toBe(3);
    });

    test("a claimed event invalidates nothing", () => {
        registerRealtimeReducer("feedback_reports", () => true);
        const seen: RealtimeQueryKey[] = [];
        const batcher = createRealtimeEventBatcher(
            dispatchRealtimeEvent,
            (key) => seen.push(key),
            10_000,
        );

        batcher.add({
            collection: "feedback_reports",
            action: "update",
            record: { id: "r1" },
        });
        batcher.flush();
        expect(seen).toEqual([]);
    });

    test("applies events in order before invalidating the unclaimed ones", () => {
        const order: string[] = [];
        const batcher = createRealtimeEventBatcher(
            (event) => {
                order.push(`event:${event.record.id}`);
                return false;
            },
            (key) => order.push(`key:${queryKeyFingerprint(key)}`),
            10_000,
        );

        batcher.add({
            collection: "posts",
            action: "create",
            record: { id: "p1" },
        });
        batcher.add({
            collection: "notifications",
            action: "create",
            record: { id: "n1" },
        });
        batcher.addKeys([qk.posts.all]);
        batcher.flush();

        expect(order.slice(0, 2)).toEqual(["event:p1", "event:n1"]);
        expect(order).toContain(`key:${queryKeyFingerprint(qk.posts.all)}`);
        expect(order).toContain(
            `key:${queryKeyFingerprint(qk.notifications.all)}`,
        );
        // `posts` and the explicit catch-up key collapse into one call.
        expect(
            order.filter(
                (entry) => entry === `key:${queryKeyFingerprint(qk.posts.all)}`,
            ),
        ).toHaveLength(1);
    });

    test("dispose drops queued work so logout cannot refetch", () => {
        const seen: RealtimeQueryKey[] = [];
        const batcher = createRealtimeEventBatcher(
            () => false,
            (key) => seen.push(key),
            10_000,
        );
        batcher.add({
            collection: "posts",
            action: "create",
            record: { id: "p1" },
        });
        batcher.dispose();
        expect(batcher.pendingCount()).toBe(0);
        batcher.flush();
        expect(seen).toEqual([]);
    });
});
