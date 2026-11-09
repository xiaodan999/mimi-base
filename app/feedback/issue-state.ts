/**
 * GitHub issue state is read through the supervisor, not stored on the
 * report row. The response is intentionally sparse: a number GitHub could not
 * resolve is omitted, and the UI keeps its existing「已建 Issue」label.
 */

export type FeedbackIssueState = "open" | "closed";

/** Keyed by issue number so both feedback lists can share the result. */
export type FeedbackIssueStates = Record<number, FeedbackIssueState>;

export function parseFeedbackIssueStates(value: unknown): FeedbackIssueStates {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    const states: FeedbackIssueStates = {};
    for (const [key, state] of Object.entries(value)) {
        const number = Number(key);
        if (
            Number.isInteger(number) &&
            number > 0 &&
            (state === "open" || state === "closed")
        ) {
            states[number] = state;
        }
    }
    return states;
}
