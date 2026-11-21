/**
 * Issue-state refresh limits: a list visit triggers the endpoint, so these
 * caps only stop abuse and protect the GitHub token.
 */

import {
    type CounterStore,
    createDailyQuota,
    createMemoryCounterStore,
    createWindowLimiter,
    type Limiter,
} from "../http/rate-limit";

const ISSUE_STATE_PER_MINUTE = 6;
const ISSUE_STATE_PER_DAY = 50;

export type IssueStateLimiters = {
    minute: Limiter;
    daily: Limiter;
};

export function createIssueStateLimiters(
    now: () => number,
    store: CounterStore = createMemoryCounterStore({ now }),
): IssueStateLimiters {
    return {
        minute: createWindowLimiter(store, {
            name: "feedback-issue-state-minute",
            limit: ISSUE_STATE_PER_MINUTE,
            windowMs: 60_000,
            now,
        }),
        daily: createDailyQuota(store, {
            name: "feedback-issue-state-day",
            limit: ISSUE_STATE_PER_DAY,
            now,
        }),
    };
}
