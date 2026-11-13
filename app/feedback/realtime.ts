import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import pb from "@/lib/pb";
import { qk } from "@/lib/query-keys";
import { registerRealtimeReducer } from "@/lib/realtime";

import {
    applyFeedbackEvent,
    type FeedbackKind,
    type FeedbackReportPages,
    type FeedbackReportRecord,
    replaceReportInPages,
    reportInScope,
} from "./reports";

const COLLECTION = "feedback_reports";

function listKey(kind: FeedbackKind, viewerId: string) {
    return kind === "bug"
        ? qk.feedback.reports(viewerId)
        : qk.feedback.features(viewerId);
}

/**
 * Patch the mounted feedback lists from realtime events instead of
 * invalidating `qk.feedback.all`.
 *
 * The issue-state sync on `/feedback` writes `issue_state` back onto every
 * listed report, and each write emits an event. With prefix invalidation that
 * event re-ran the state POST, which wrote again — a self-sustaining loop.
 * Patching in place breaks it: the badge still updates live, and the state
 * query (a sibling key, never touched here) is only re-created when the set of
 * eligible report ids actually changes.
 *
 * Registered while the page is mounted; events missed while it is closed are
 * covered by the next fetch.
 */
export function useFeedbackRealtime(viewerId: string) {
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!viewerId) return;

        // SSE records carry no `expand`, so a created row arrives without its
        // author. Fetch that one row once to fill in the avatar/name instead
        // of rebuilding every loaded page.
        const enrichAuthor = (kind: FeedbackKind, id: string) => {
            void pb
                .collection(COLLECTION)
                .getOne<FeedbackReportRecord>(id, { expand: "owner" })
                .then((record) => {
                    const key = listKey(kind, viewerId);
                    const current =
                        queryClient.getQueryData<FeedbackReportPages>(key);
                    const next = replaceReportInPages(current, record);
                    if (next && next !== current) {
                        queryClient.setQueryData<FeedbackReportPages>(
                            key,
                            next,
                        );
                    }
                })
                .catch(() => {
                    // The unexpanded row stays; the next fetch fills it in.
                });
        };

        const subscribe = (kind: FeedbackKind) => {
            const key = listKey(kind, viewerId);
            return registerRealtimeReducer(COLLECTION, (event) => {
                const current =
                    queryClient.getQueryData<FeedbackReportPages>(key);
                const next = applyFeedbackEvent(current, event, {
                    kind,
                    viewerId,
                });
                // No cache to patch (first load / closed tab): let the
                // realtime layer invalidate the key instead.
                if (next === null) return false;
                if (next !== current) {
                    queryClient.setQueryData<FeedbackReportPages>(key, next);
                }
                if (event.action === "create") {
                    const id = event.record.id;
                    const record =
                        event.record as Partial<FeedbackReportRecord>;
                    // Only the list that will actually show the row fetches
                    // its author; the other tab's reducer is a no-op here.
                    if (
                        typeof id === "string" &&
                        id &&
                        typeof record.kind === "string" &&
                        typeof record.owner === "string" &&
                        reportInScope(
                            {
                                kind: record.kind as FeedbackKind,
                                owner: record.owner,
                            },
                            { kind, viewerId },
                        )
                    ) {
                        enrichAuthor(kind, id);
                    }
                }
                return true;
            });
        };

        const unsubscribeBug = subscribe("bug");
        const unsubscribeFeature = subscribe("feature");
        return () => {
            unsubscribeBug();
            unsubscribeFeature();
        };
    }, [queryClient, viewerId]);
}
