/**
 * GitHub issue state is persisted on the report row (`issue_state`) and
 * refreshed through the Bun API while the issue is still open. Both
 * parsers are defensive: an unknown value is ignored, so the badge falls back
 * to「已建 Issue」instead of showing garbage or breaking the list.
 */

import { parseApiError } from "@/lib/contracts/api";
import type {
    FeedbackIssueState,
    FeedbackIssueStates,
} from "@/lib/contracts/feedback";

export type { FeedbackIssueState, FeedbackIssueStates };

/** `POST /api/feedback/issue-state` success payload. */
export type FeedbackIssueStateResponse = {
    states: FeedbackIssueStates;
    reason?: string;
};

export function parseFeedbackIssueStateResponse(
    value: unknown,
): FeedbackIssueStateResponse {
    const body =
        value && typeof value === "object" && !Array.isArray(value)
            ? (value as { states?: unknown; reason?: unknown })
            : {};
    const reason = typeof body.reason === "string" ? body.reason : undefined;
    return {
        states: parseFeedbackIssueStates(body.states),
        ...(reason ? { reason } : {}),
    };
}

/** Unified error envelope from the same endpoint. */
export function parseFeedbackIssueStateError(value: unknown) {
    return parseApiError(value);
}

/** The persisted select field; empty/unknown values mean "not known yet". */
export function parseRecordIssueState(
    value: unknown,
): FeedbackIssueState | undefined {
    return value === "open" || value === "closed" ? value : undefined;
}

/**
 * GitHub issue numbers are positive integers. The PB number field may still
 * hold 0 or a stale/partial value, so callers must not print those as `#0`.
 */
export function parseIssueNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value > 0
        ? value
        : undefined;
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
