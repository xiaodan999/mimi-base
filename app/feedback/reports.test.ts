import { describe, expect, test } from "bun:test";

import {
    applyFeedbackEvent,
    type FeedbackReportPage,
    type FeedbackReportRecord,
    flattenReportPages,
    mergeReportRecord,
    replaceReportInPages,
    reportTotal,
} from "./reports";

const VIEWER = "u1";
const OTHER = "u2";

function report(
    overrides: Partial<FeedbackReportRecord> & { id: string },
): FeedbackReportRecord {
    return {
        owner: VIEWER,
        kind: "bug",
        title: "标题",
        description: "描述",
        status: "stored",
        created: "2026-11-13 10:00:00.000Z",
        updated: "2026-11-13 10:00:00.000Z",
        ...overrides,
    };
}

function pages(
    items: FeedbackReportRecord[],
    totalItems = items.length,
): {
    pages: FeedbackReportPage[];
    pageParams: number[];
} {
    return {
        pages: [{ items, totalItems, nextPage: null }],
        pageParams: [1],
    };
}

const bugScope = { kind: "bug" as const, viewerId: VIEWER };
const featureScope = { kind: "feature" as const, viewerId: VIEWER };

describe("flattenReportPages", () => {
    test("keeps page order and drops the duplicate an insert can create", () => {
        const first = report({ id: "r1" });
        const duplicate = report({ id: "r1", title: "旧值" });
        const second = report({ id: "r2" });

        expect(
            flattenReportPages({
                pages: [
                    { items: [first], totalItems: 2, nextPage: 2 },
                    {
                        items: [duplicate, second],
                        totalItems: 2,
                        nextPage: null,
                    },
                ],
            }).map((item) => item.id),
        ).toEqual(["r1", "r2"]);
    });

    test("handles a missing cache", () => {
        expect(flattenReportPages(undefined)).toEqual([]);
        expect(reportTotal(undefined)).toBe(0);
    });
});

describe("applyFeedbackEvent", () => {
    test("prepends a new suggestion and grows the total", () => {
        const existing = report({ id: "r1", kind: "feature" });
        const created = report({ id: "r2", kind: "feature" });
        const data = pages([existing]);

        const next = applyFeedbackEvent(
            data,
            {
                action: "create",
                record: created as unknown as Record<string, unknown>,
            },
            featureScope,
        );

        expect(next?.pages[0].items.map((item) => item.id)).toEqual([
            "r2",
            "r1",
        ]);
        expect(next?.pages[0].totalItems).toBe(2);
    });

    test("ignores a row belonging to the other list", () => {
        const data = pages([report({ id: "r1", kind: "feature" })]);
        const next = applyFeedbackEvent(
            data,
            {
                action: "create",
                record: report({ id: "r2", kind: "bug" }) as unknown as Record<
                    string,
                    unknown
                >,
            },
            featureScope,
        );
        expect(next).toBe(data);
    });

    test("hides another account's bug report from 我的反馈", () => {
        const data = pages([report({ id: "r1" })]);
        const next = applyFeedbackEvent(
            data,
            {
                action: "create",
                record: report({ id: "r2", owner: OTHER }) as unknown as Record<
                    string,
                    unknown
                >,
            },
            bugScope,
        );
        expect(next).toBe(data);
    });

    test("patches an update but keeps the resolved author", () => {
        const existing = report({
            id: "r1",
            kind: "feature",
            issue_state: "open",
            expand: { owner: { id: OTHER, user_name: "她" } as never },
        });
        const data = pages([existing]);

        const next = applyFeedbackEvent(
            data,
            {
                action: "update",
                record: {
                    id: "r1",
                    kind: "feature",
                    issue_state: "closed",
                    issue_state_checked: "2026-11-13 11:00:00.000Z",
                },
            },
            featureScope,
        );

        const patched = next?.pages[0].items[0];
        expect(patched?.issue_state).toBe("closed");
        expect(patched?.expand?.owner?.user_name).toBe("她");
    });

    test("skips the cache write when only unchecked noise changed", () => {
        const existing = report({ id: "r1", issue_state: "open" });
        const data = pages([existing]);

        const next = applyFeedbackEvent(
            data,
            {
                action: "update",
                record: {
                    id: "r1",
                    issue_state: "open",
                    issue_state_checked: "2026-11-13 11:30:00.000Z",
                },
            },
            bugScope,
        );

        // Same reference: React Query subscribers do not re-render for the
        // issue-state sync's timestamp-only writes.
        expect(next).toBe(data);
    });

    test("removes a deleted row and shrinks the total", () => {
        const data = pages([report({ id: "r1" }), report({ id: "r2" })]);

        const next = applyFeedbackEvent(
            data,
            { action: "delete", record: { id: "r1" } },
            bugScope,
        );

        expect(next?.pages[0].items.map((item) => item.id)).toEqual(["r2"]);
        expect(next?.pages[0].totalItems).toBe(1);
    });

    test("does not resurrect a delete that missed the window", () => {
        const data = pages([report({ id: "r1" })]);
        expect(
            applyFeedbackEvent(
                data,
                { action: "delete", record: { id: "r9" } },
                bugScope,
            ),
        ).toBe(data);
    });

    test("treats an update outside the loaded window as a no-op", () => {
        const data = pages([report({ id: "r1" })]);
        expect(
            applyFeedbackEvent(
                data,
                { action: "update", record: { id: "r9", status: "failed" } },
                bugScope,
            ),
        ).toBe(data);
    });

    test("falls back to invalidation without a cache", () => {
        expect(
            applyFeedbackEvent(
                undefined,
                { action: "update", record: { id: "r1" } },
                bugScope,
            ),
        ).toBeNull();
        expect(
            applyFeedbackEvent(
                { pages: [], pageParams: [] },
                { action: "update", record: { id: "r1" } },
                bugScope,
            ),
        ).toBeNull();
    });
});

describe("mergeReportRecord", () => {
    test("lets event fields win without dropping the expansion", () => {
        const existing = report({
            id: "r1",
            expand: { owner: { id: VIEWER, user_name: "我" } as never },
        });
        const merged = mergeReportRecord(existing, {
            id: "r1",
            status: "issue_created",
        });
        expect(merged.status).toBe("issue_created");
        expect(merged.expand?.owner?.user_name).toBe("我");
    });
});

describe("replaceReportInPages", () => {
    test("swaps in the fully expanded row", () => {
        const data = pages([report({ id: "r1" })]);
        const expanded = report({
            id: "r1",
            expand: { owner: { id: VIEWER, user_name: "我" } as never },
        });
        const next = replaceReportInPages(data, expanded);
        expect(next?.pages[0].items[0]).toBe(expanded);
        expect(next?.pages[0].totalItems).toBe(1);
    });

    test("leaves the cache alone when the row is not loaded", () => {
        const data = pages([report({ id: "r1" })]);
        expect(replaceReportInPages(data, report({ id: "r9" }))).toBe(data);
        expect(replaceReportInPages(undefined, report({ id: "r9" }))).toBe(
            undefined,
        );
    });
});
