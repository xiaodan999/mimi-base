/**
 * Feedback types shared by the split service modules.
 */

import type {
    FeedbackAttachment,
    FeedbackIssueState,
    FeedbackReport,
} from "../../lib/contracts/feedback";

export type { FeedbackAttachment, FeedbackIssueState, FeedbackReport };

export type TranscriptMessage = {
    role: string;
    text: string;
};

export type FeedbackDeps = {
    /** PocketBase base URL (loopback in dev, mimi-pb in compose). */
    pbBaseUrl: string;
    /** Server-held GitHub token. Empty accepts the report without syncing. */
    githubToken: string;
    /** owner/repo, e.g. xiaohai-huang/mimi-base. Empty disables syncing. */
    githubRepo: string;
    /** GitHub API base; override a local mock in tests. */
    githubApiUrl?: string;
    /** GitHub asset-upload base; override a local mock in tests. */
    githubUploadsUrl?: string;
    /**
     * PocketBase superuser used to persist issue state on shared feature
     * suggestions (their owner is the other account). Empty falls back to
     * the caller's token, which can only update the caller's own rows.
     */
    pbAdminEmail?: string;
    pbAdminPassword?: string;
    /** Injectable for tests. */
    fetch?: typeof fetch;
    now?: () => number;
};

export type ReleaseResult =
    { ok: true; id: number } | { ok: false; status: number; error: string };

export type IssueCreated = {
    ok: true;
    url: string;
    number: number;
};

export type IssueFailure = { ok: false; error: string };
