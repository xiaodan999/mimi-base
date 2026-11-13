import type { InfiniteData } from "@tanstack/react-query";

import type { UserRecord } from "@/lib/pb-types";
import type { RealtimeAction } from "@/lib/realtime";

import type { FeedbackAttachment } from "./attachments";

/**
 * Report rows and the pure helpers that page them.
 *
 * Kept free of `pb` and React so the paging and realtime transforms can be
 * unit-tested without a browser or a PocketBase instance (`data.ts` owns the
 * queries and re-exports these types).
 */

export type FeedbackStatus = "stored" | "issue_created" | "failed";
export type FeedbackKind = "bug" | "feature";

export type FeedbackReportRecord = {
    id: string;
    owner: string;
    kind: FeedbackKind;
    title: string;
    description: string;
    route?: string;
    app_version?: string;
    app_sha?: string;
    user_agent?: string;
    console?: unknown;
    status: FeedbackStatus;
    issue_url?: string;
    issue_number?: number;
    /** Persisted GitHub state; `closed` stops further refreshes. */
    issue_state?: string;
    /** When the Bun API last confirmed the GitHub state. */
    issue_state_checked?: string;
    error?: string;
    /** Public GitHub URLs + display metadata; no file bytes live in PB. */
    attachments?: FeedbackAttachment[];
    conversation?: string;
    /** `owner` is expanded by the shared suggestion list. */
    expand?: {
        owner?: UserRecord;
    };
    created: string;
    updated: string;
};

/** One page of a feedback list, shaped for `useInfiniteQuery`. */
export type FeedbackReportPage = {
    items: FeedbackReportRecord[];
    totalItems: number;
    nextPage: number | null;
};

export type FeedbackReportPages = InfiniteData<FeedbackReportPage, number>;

/** The list a record belongs to; `bug` is owner-scoped, `feature` is shared. */
export type FeedbackEventScope = { kind: FeedbackKind; viewerId: string };

/** Flatten pages, dropping rows offset paging can repeat after an insert. */
export function flattenReportPages(
    data: { pages: readonly FeedbackReportPage[] } | undefined,
): FeedbackReportRecord[] {
    if (!data) return [];
    const seen = new Set<string>();
    const out: FeedbackReportRecord[] = [];
    for (const page of data.pages) {
        for (const item of page.items) {
            if (seen.has(item.id)) continue;
            seen.add(item.id);
            out.push(item);
        }
    }
    return out;
}

/** `totalItems` from the first page: the counter, not the loaded window. */
export function reportTotal(
    data: { pages: readonly FeedbackReportPage[] } | undefined,
): number {
    return data?.pages[0]?.totalItems ?? 0;
}

function findReport(
    pages: readonly FeedbackReportPage[],
    id: string,
): { page: number; item: number } | null {
    for (let page = 0; page < pages.length; page += 1) {
        const item = pages[page].items.findIndex((report) => report.id === id);
        if (item >= 0) return { page, item };
    }
    return null;
}

function isVisible(
    report: Pick<FeedbackReportRecord, "kind" | "owner">,
    scope: FeedbackEventScope,
): boolean {
    if (report.kind !== scope.kind) return false;
    // Mirrors `filters.ts` / the PocketBase rules: suggestions are shared,
    // bug reports belong to their owner.
    return scope.kind === "feature" || report.owner === scope.viewerId;
}

/** Whether a record belongs in this list (also used before enriching it). */
export function reportInScope(
    record: Pick<FeedbackReportRecord, "kind" | "owner">,
    scope: FeedbackEventScope,
): boolean {
    return isVisible(record, scope);
}

/**
 * SSE payloads carry no `expand`, so a blind spread would replace the resolved
 * author with nothing and blank the avatar/name on the card.
 */
export function mergeReportRecord(
    existing: FeedbackReportRecord,
    incoming: Record<string, unknown>,
): FeedbackReportRecord {
    const merged = { ...existing, ...incoming } as FeedbackReportRecord;
    if (existing.expand) merged.expand = existing.expand;
    return merged;
}

/**
 * Fields the card actually paints. The issue-state sync rewrites
 * `issue_state_checked` on every visit; without this guard each write would
 * re-render the whole visible list (and re-create the issue-state key) for a
 * value nothing displays.
 */
const RENDERED_FIELDS = [
    "owner",
    "kind",
    "title",
    "description",
    "status",
    "issue_url",
    "issue_number",
    "issue_state",
    "error",
    "attachments",
    "conversation",
    "created",
] as const satisfies ReadonlyArray<keyof FeedbackReportRecord>;

function sameRendered(
    a: FeedbackReportRecord,
    b: FeedbackReportRecord,
): boolean {
    return RENDERED_FIELDS.every((field) => a[field] === b[field]);
}

function replaceItems(
    pages: readonly FeedbackReportPage[],
    pageIndex: number,
    items: FeedbackReportRecord[],
): FeedbackReportPage[] {
    return pages.map((page, index) =>
        index === pageIndex ? { ...page, items } : page,
    );
}

/**
 * Apply one `feedback_reports` realtime event to a list cache.
 *
 * Returns `null` when the cache cannot be updated in place (`undefined`, an
 * empty page window, or an action we do not understand) so the caller can fall
 * back to invalidating the key. A handled event returns `data` unchanged when
 * it has no visible effect.
 */
export function applyFeedbackEvent<P>(
    data: InfiniteData<FeedbackReportPage, P> | undefined,
    event: { action: RealtimeAction; record: Record<string, unknown> },
    scope: FeedbackEventScope,
): InfiniteData<FeedbackReportPage, P> | null {
    if (!data || data.pages.length === 0) return null;
    const id = typeof event.record.id === "string" ? event.record.id : "";
    if (!id) return null;

    const found = findReport(data.pages, id);

    if (event.action === "delete") {
        if (!found) return data;
        const page = data.pages[found.page];
        const items = page.items.filter((report) => report.id !== id);
        const pages = replaceItems(data.pages, found.page, items).map(
            (entry, index) =>
                index === found.page
                    ? {
                          ...entry,
                          totalItems: Math.max(0, entry.totalItems - 1),
                      }
                    : entry,
        );
        return { ...data, pages };
    }

    if (event.action === "create") {
        const record = event.record as unknown as FeedbackReportRecord;
        if (!isVisible(record, scope)) return data;
        if (found) return data;
        const pages = data.pages.map((page, index) =>
            index === 0
                ? {
                      ...page,
                      items: [record, ...page.items],
                      totalItems: page.totalItems + 1,
                  }
                : page,
        );
        return { ...data, pages };
    }

    if (event.action !== "update") return null;
    // Not in the loaded window: the page that eventually shows it is fetched
    // fresh, so there is nothing to patch.
    if (!found) return data;

    const existing = data.pages[found.page].items[found.item];
    const merged = mergeReportRecord(existing, event.record);

    if (!isVisible(merged, scope)) {
        const items = data.pages[found.page].items.filter(
            (report) => report.id !== id,
        );
        const pages = replaceItems(data.pages, found.page, items).map(
            (entry, index) =>
                index === found.page
                    ? {
                          ...entry,
                          totalItems: Math.max(0, entry.totalItems - 1),
                      }
                    : entry,
        );
        return { ...data, pages };
    }

    if (sameRendered(existing, merged)) return data;

    const items = data.pages[found.page].items.map((report, index) =>
        index === found.item ? merged : report,
    );
    return { ...data, pages: replaceItems(data.pages, found.page, items) };
}

/** Replace a row wholesale (used after re-fetching a created record). */
export function replaceReportInPages<P>(
    data: InfiniteData<FeedbackReportPage, P> | undefined,
    record: FeedbackReportRecord,
): InfiniteData<FeedbackReportPage, P> | undefined {
    if (!data) return data;
    const found = findReport(data.pages, record.id);
    if (!found) return data;
    const items = data.pages[found.page].items.map((item) =>
        item.id === record.id ? record : item,
    );
    return { ...data, pages: replaceItems(data.pages, found.page, items) };
}
