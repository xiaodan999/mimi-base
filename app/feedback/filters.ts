/**
 * Client-side mirror of the `feedback_reports` visibility rules.
 *
 * The real boundary is PocketBase (see
 * `pocketbase/pb_migrations/1795800000_share_feature_feedback.js`):
 * feature suggestions are readable by both accounts, bug reports only by
 * their owner. These helpers keep the two tabs honest even if a query filter
 * is ever loosened by mistake, and they are pure so they can be unit-tested.
 */

export type VisibleFeedbackReport = {
    owner: string;
    kind?: string;
};

/** Feature suggestions are shared with the other account. */
export function isFeatureSuggestion(report: VisibleFeedbackReport): boolean {
    return report.kind === "feature";
}

/** What one account may read: its own rows plus every feature suggestion. */
export function canSeeFeedbackReport(
    report: VisibleFeedbackReport,
    viewerId: string,
): boolean {
    return isFeatureSuggestion(report) || report.owner === viewerId;
}

/** 「大家的建议」: every suggestion, regardless of author. */
export function selectFeatureSuggestions<T extends VisibleFeedbackReport>(
    reports: readonly T[],
): T[] {
    return reports.filter(isFeatureSuggestion);
}

/** 「我的反馈」: the viewer's own bug reports, never suggestions. */
export function selectOwnBugReports<T extends VisibleFeedbackReport>(
    reports: readonly T[],
    viewerId: string,
): T[] {
    return reports.filter(
        (report) => report.kind !== "feature" && report.owner === viewerId,
    );
}
