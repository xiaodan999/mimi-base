/**
 * GitHub issue state is persisted on the report row (`issue_state`) and
 * refreshed through the supervisor while the issue is still open. Both
 * parsers are defensive: an unknown value is ignored, so the badge falls back
 * to「已建 Issue」instead of showing garbage or breaking the list.
 */

export type FeedbackIssueState = "open" | "closed";

/** Keyed by issue number so both feedback lists can share the result. */
export type FeedbackIssueStates = Record<number, FeedbackIssueState>;

/** The persisted select field; empty/unknown values mean "not known yet". */
export function parseRecordIssueState(
    value: unknown,
): FeedbackIssueState | undefined {
    return value === "open" || value === "closed" ? value : undefined;
}

export function parseFeedbackIssueStates(value: unknown): FeedbackIssueStates {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    const states: FeedbackIssueStates = {};
    for (const [key, raw] of Object.entries(value)) {
        const number = Number(key);
        const state = parseRecordIssueState(raw);
        if (Number.isInteger(number) && number > 0 && state) {
            states[number] = state;
        }
    }
    return states;
}
