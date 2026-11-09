import { describe, expect, test } from "bun:test";

import { qk } from "./query-keys";
import {
    ALL_REALTIME_INVALIDATION_KEYS,
    REALTIME_COLLECTIONS,
    createInvalidationBatcher,
    dedupeQueryKeys,
    queryKeyFingerprint,
    realtimeInvalidationKeys,
    type RealtimeQueryKey,
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
    });

    test("maps study progress to both the editor and the overview", () => {
        expect(realtimeInvalidationKeys("study_progress")).toEqual([
            qk.studyProgressAll,
            qk.studySummariesAll,
        ]);
    });

    test("maps feedback writes to both feedback lists", () => {
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

describe("createInvalidationBatcher", () => {
    test("collapses a burst into one invalidation per prefix", () => {
        const seen: RealtimeQueryKey[] = [];
        const batcher = createInvalidationBatcher(
            (key) => seen.push(key),
            10_000,
        );

        batcher.add([qk.posts.all, qk.homeStats.all]);
        batcher.add([qk.posts.all]);
        expect(batcher.pendingCount()).toBe(2);

        batcher.flush();
        expect(seen).toEqual([qk.posts.all, qk.homeStats.all]);
        expect(batcher.pendingCount()).toBe(0);

        // A second flush with nothing queued is a no-op.
        batcher.flush();
        expect(seen.length).toBe(2);
    });

    test("keeps distinct prefixes from one event", () => {
        const seen: string[] = [];
        const batcher = createInvalidationBatcher(
            (key) => seen.push(queryKeyFingerprint(key)),
            10_000,
        );
        batcher.add([qk.comments.root, qk.posts.all]);
        batcher.flush();
        expect(seen).toEqual([
            queryKeyFingerprint(qk.comments.root),
            queryKeyFingerprint(qk.posts.all),
        ]);
    });

    test("dispose drops queued work so logout cannot refetch", () => {
        const seen: RealtimeQueryKey[] = [];
        const batcher = createInvalidationBatcher(
            (key) => seen.push(key),
            10_000,
        );
        batcher.add([qk.posts.all]);
        batcher.dispose();
        expect(batcher.pendingCount()).toBe(0);
        batcher.flush();
        expect(seen).toEqual([]);
    });
});
