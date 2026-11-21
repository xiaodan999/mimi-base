/**
 * Feedback contract shared by the Bun API and the browser.
 *
 * Attachment metadata, issue state, report statuses and the API caps live
 * here so the two sides cannot drift. The row type is the server/PB shape;
 * the browser extends it with its `expand` and date mapping.
 */

export const FEEDBACK_REPORT_PATH = "/api/feedback/report";
export const FEEDBACK_UPLOAD_PATH = "/api/feedback/upload";
export const FEEDBACK_ISSUE_STATE_PATH = "/api/feedback/issue-state";

export const MAX_FEEDBACK_ATTACHMENTS = 3;
export const MAX_FEEDBACK_FILE_BYTES = 10 * 1024 * 1024;
/** Declared-body cap: three 10MB files plus multipart overhead. */
export const MAX_FEEDBACK_UPLOAD_BYTES =
    MAX_FEEDBACK_ATTACHMENTS * MAX_FEEDBACK_FILE_BYTES + 256 * 1024;
export const MAX_FEEDBACK_BODY_BYTES = 8 * 1024;
/** The feedback lists never send more than this many ids at once. */
export const MAX_FEEDBACK_ISSUE_STATE_REPORTS = 50;

/** Public metadata for one attachment already uploaded to GitHub. */
export type FeedbackAttachment = {
    /** Original browser file name, shown in the UI and the issue body. */
    name: string;
    /** Public GitHub release/destination URL returned by the Bun API. */
    url: string;
    /** Bytes; omitted when the server did not report one. */
    size?: number;
    /** MIME type as sent by the browser; `image/*` renders inline. */
    type?: string;
};

export type FeedbackIssueState = "open" | "closed";

/** Keyed by issue number so both feedback lists can share the result. */
export type FeedbackIssueStates = Record<number, FeedbackIssueState>;

export type FeedbackStatus = "stored" | "issue_created" | "failed";
export type FeedbackKind = "bug" | "feature";

/** The PocketBase row shape the API reads and writes. */
export type FeedbackReport = {
    id: string;
    owner: string;
    kind?: FeedbackKind | string;
    title: string;
    description: string;
    route?: string;
    app_version?: string;
    app_sha?: string;
    user_agent?: string;
    console?: unknown;
    status?: FeedbackStatus | string;
    issue_url?: string;
    issue_number?: number;
    /** Persisted GitHub state; `closed` is terminal for the refresh. */
    issue_state?: FeedbackIssueState | string;
    issue_state_checked?: string;
    error?: string;
    /** JSON field: `[{ name, url, size, type }]`, stored by the client. */
    attachments?: unknown;
    conversation?: string;
    created?: string;
};

export type FeedbackIssue = { url: string; number: number | null };

/** Successful sync/report response (also used by the retry path). */
export type FeedbackSyncResponse = {
    ok?: boolean;
    synced?: boolean;
    reason?: string;
    error?: string;
    issue?: FeedbackIssue | null;
    report?: { id: string; status: string };
};

export type FeedbackUploadResponse = {
    ok?: boolean;
    reason?: string;
    error?: string;
    attachments?: unknown;
};

export type FeedbackIssueStateResponse = {
    ok?: boolean;
    states?: unknown;
    reason?: string;
};
