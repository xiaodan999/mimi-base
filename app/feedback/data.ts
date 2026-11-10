import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
    type ChatConversationRecord,
    toChatConversation,
} from "@/app/chat/records";
import type { ChatConversation } from "@/app/chat/types";
import { useCurrentUser } from "@/lib/auth";
import { apiUrl } from "@/lib/env";
import pb from "@/lib/pb";
import type { UserRecord } from "@/lib/pb-types";
import { qk } from "@/lib/query-keys";

import { type FeedbackAttachment, parseAttachmentList } from "./attachments";
import { getFeedbackErrors } from "./error-buffer";
import {
    type FeedbackIssueStates,
    parseFeedbackIssueStates,
    parseRecordIssueState,
} from "./issue-state";

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
    /** When the supervisor last confirmed the GitHub state. */
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

export type FeedbackIssue = { url: string; number: number | null };

export type SubmitFeedbackInput = {
    kind: FeedbackKind;
    title: string;
    description: string;
    route: string;
    /** Images and arbitrary files; uploaded to GitHub before the row exists. */
    attachments: File[];
    /** Bug reports only; feature suggestions never require a conversation. */
    conversationId?: string;
};

export type SubmitFeedbackResult = {
    /** The PocketBase row always exists once the mutation resolves. */
    report: FeedbackReportRecord;
    /** `null` when GitHub is not configured / unreachable. */
    issue: FeedbackIssue | null;
    synced: boolean;
    /** Machine-readable server reason, e.g. `github_not_configured`. */
    reason?: string;
    /** Human-readable sync failure (the report is still stored). */
    syncError?: string;
};

/** Same-origin proxy, or the PB host's `/api` origin on Vercel. */
export function feedbackUrl(path = "/report"): string {
    return apiUrl(`/feedback${path.startsWith("/") ? path : `/${path}`}`);
}

function appVersion(): string {
    return typeof APP_VERSION === "string" ? APP_VERSION : "dev";
}

function appSha(): string {
    return typeof APP_SHA === "string" ? APP_SHA : "dev";
}

type UploadResponse = {
    ok?: unknown;
    reason?: unknown;
    error?: unknown;
    attachments?: unknown;
};

/**
 * Upload images/files to GitHub through the supervisor *before* creating the
 * report. GitHub has no issue-attachment REST API, so the supervisor stores
 * them on the `feedback-assets` release and returns public URLs. Any failure
 * throws: the row must never claim attachments that are not reachable.
 */
async function uploadAttachments(files: File[]): Promise<FeedbackAttachment[]> {
    if (files.length === 0) return [];
    const token = pb.authStore.token;
    if (!token) throw new Error("登录已过期，请重新登录");

    const form = new FormData();
    for (const file of files) {
        form.append("files", file, file.name);
    }

    let res: Response;
    try {
        res = await fetch(feedbackUrl("/upload"), {
            method: "POST",
            headers: { Authorization: token },
            body: form,
        });
    } catch {
        throw new Error(
            "附件上传到 GitHub 失败（网络异常），可以移除附件后只提交文字",
        );
    }

    let body: UploadResponse = {};
    try {
        body = (await res.json()) as UploadResponse;
    } catch {
        // proxy error page; fall through to the status message
    }

    const attachments = parseAttachmentList(body.attachments);
    if (res.ok && body.ok !== false && attachments.length === files.length) {
        return attachments;
    }
    if (body.reason === "github_not_configured") {
        throw new Error(
            "服务端还没有配置 GitHub，附件传不上去；移除附件后可以只提交文字",
        );
    }
    const message =
        typeof body.error === "string" && body.error
            ? body.error
            : res.status === 401
              ? "登录已过期，请重新登录"
              : "附件上传失败";
    throw new Error(`${message}，可以移除附件后只提交文字`);
}

/**
 * Create the owner-scoped report. Attachments were uploaded to GitHub first,
 * so this only writes their metadata: no File parts, no bytes in PocketBase.
 * Status is always `stored` at create time; only the supervisor may flip it.
 */
async function createReport(
    userId: string,
    input: SubmitFeedbackInput,
    attachments: FeedbackAttachment[],
): Promise<FeedbackReportRecord> {
    const payload: Record<string, unknown> = {
        owner: userId,
        kind: input.kind,
        title: input.title,
        description: input.description,
        route: input.route,
        app_version: appVersion(),
        app_sha: appSha(),
        user_agent: navigator.userAgent,
        status: "stored",
        // JSONField stores the array; sending the serialized form is explicit
        // and survives a FormData-free request.
        attachments: JSON.stringify(attachments),
    };
    // Console output is a bug-report diagnostic; a feature idea does not need
    // it, and sending it would make the GitHub issue noisier for no reason.
    if (input.kind === "bug") {
        payload.console = JSON.stringify(getFeedbackErrors());
    }
    if (input.conversationId) {
        payload.conversation = input.conversationId;
    }

    const record = await pb
        .collection("feedback_reports")
        .create<FeedbackReportRecord>(payload);
    if (!record?.id) {
        // Same empty-200 trap as posts: a middleware that never calls
        // e.next() looks like success to the SDK but saves nothing.
        throw new Error("提交失败：服务器没有返回反馈记录");
    }
    return record;
}

type SyncResponse = {
    ok?: unknown;
    synced?: unknown;
    reason?: unknown;
    error?: unknown;
    issue?: { url?: unknown; number?: unknown } | null;
};

function parseIssue(value: SyncResponse["issue"]): FeedbackIssue | null {
    if (!value || typeof value !== "object") return null;
    if (typeof value.url !== "string" || !value.url) return null;
    return {
        url: value.url,
        number:
            typeof value.number === "number" && Number.isFinite(value.number)
                ? Math.floor(value.number)
                : null,
    };
}

/**
 * Ask the supervisor to open the GitHub issue. Any failure here is non-fatal:
 * the report already exists, so the caller shows 已收到反馈，暂未同步 GitHub.
 */
async function syncIssue(reportId: string): Promise<{
    issue: FeedbackIssue | null;
    synced: boolean;
    reason?: string;
    syncError?: string;
}> {
    const token = pb.authStore.token;
    if (!token) {
        return { issue: null, synced: false, reason: "unauthorized" };
    }

    let res: Response;
    try {
        res = await fetch(feedbackUrl(), {
            method: "POST",
            headers: {
                "content-type": "application/json",
                Authorization: token,
            },
            body: JSON.stringify({ reportId }),
        });
    } catch {
        return {
            issue: null,
            synced: false,
            reason: "network",
            syncError: "网络异常，反馈已保存",
        };
    }

    let body: SyncResponse = {};
    try {
        body = (await res.json()) as SyncResponse;
    } catch {
        // proxy error page; fall through to the status message
    }

    const issue = parseIssue(body.issue);
    if (res.ok && issue) {
        return { issue, synced: true };
    }
    if (res.ok) {
        return {
            issue: null,
            synced: false,
            reason:
                typeof body.reason === "string" ? body.reason : "not_synced",
        };
    }
    const message =
        typeof body.error === "string" && body.error
            ? body.error
            : res.status === 401
              ? "登录已过期，反馈已保存"
              : res.status === 429
                ? "提交太频繁，反馈已保存，稍后再同步"
                : "暂时无法同步到 GitHub，反馈已保存";
    return {
        issue: null,
        synced: false,
        reason:
            typeof body.reason === "string"
                ? body.reason
                : `http_${res.status}`,
        syncError: message,
    };
}

export function useFeedbackReports() {
    const user = useCurrentUser();
    return useQuery({
        queryKey: qk.feedback.reports(user.id),
        queryFn: async () =>
            pb
                .collection("feedback_reports")
                .getFullList<FeedbackReportRecord>({
                    // The collection rule now also exposes other owners'
                    // feature suggestions, so the bug tab asks for its own
                    // kind explicitly instead of relying on owner alone.
                    filter: pb.filter("owner = {:owner} && kind = {:kind}", {
                        owner: user.id,
                        kind: "bug",
                    }),
                    sort: "-created",
                    perPage: 50,
                    expand: "owner",
                }),
    });
}

/**
 * Shared across both accounts: every feature suggestion, newest first, with
 * the author expanded for the 「大家的建议」 list. The collection's list rule
 * (`@request.auth.id != "" && (kind = "feature" || owner = @request.auth.id)`)
 * is what makes this legal; bug reports never appear in this query.
 */
export function useFeatureSuggestions() {
    const user = useCurrentUser();
    return useQuery({
        queryKey: qk.feedback.features(user.id),
        queryFn: async () =>
            pb
                .collection("feedback_reports")
                .getFullList<FeedbackReportRecord>({
                    filter: pb.filter("kind = {:kind}", {
                        kind: "feature",
                    }),
                    sort: "-created",
                    perPage: 50,
                    expand: "owner",
                }),
    });
}

/**
 * Keep the GitHub state on the reports currently listed. The persisted
 * `issue_state` is what the badge paints first; this refreshes rows that are
 * still `issue_created` and not already known closed. The supervisor skips
 * GitHub for closed rows and writes new results back, and failures are
 * silent so a GitHub outage never turns the list into an error state.
 */
export function useFeedbackIssueStates(reports: FeedbackReportRecord[]) {
    const user = useCurrentUser();
    const reportIds = reports
        .filter(
            (report) =>
                report.status === "issue_created" &&
                typeof report.issue_number === "number" &&
                Number.isInteger(report.issue_number) &&
                report.issue_number > 0 &&
                parseRecordIssueState(report.issue_state) !== "closed",
        )
        .map((report) => report.id);
    const key = reportIds.join(",");

    return useQuery({
        queryKey: qk.feedback.issueStates(user.id, key),
        enabled: reportIds.length > 0,
        queryFn: async (): Promise<FeedbackIssueStates> => {
            const token = pb.authStore.token;
            if (!token) return {};
            let res: Response;
            try {
                res = await fetch(feedbackUrl("/issue-state"), {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        Authorization: token,
                    },
                    body: JSON.stringify({ reportIds }),
                });
            } catch {
                return {};
            }
            if (!res.ok) return {};
            let body: { states?: unknown };
            try {
                body = (await res.json()) as typeof body;
            } catch {
                return {};
            }
            return parseFeedbackIssueStates(body.states);
        },
        staleTime: 60_000,
        retry: false,
    });
}

/** Same cache entry as the chat list, so both pages share one fetch. */
export function useFeedbackConversations() {
    const user = useCurrentUser();
    return useQuery({
        queryKey: qk.chat.conversations(user.id),
        queryFn: async (): Promise<ChatConversation[]> =>
            (
                await pb
                    .collection("chat_conversations")
                    .getFullList<ChatConversationRecord>({
                        filter: pb.filter("owner = {:owner}", {
                            owner: user.id,
                        }),
                        sort: "-updated",
                    })
            ).map(toChatConversation),
    });
}

export function useSubmitFeedback() {
    const user = useCurrentUser();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (
            input: SubmitFeedbackInput,
        ): Promise<SubmitFeedbackResult> => {
            // Order matters: upload first, so a GitHub failure aborts before
            // a row exists (text-only reports never touch the upload path).
            const attachments = await uploadAttachments(input.attachments);
            const report = await createReport(user.id, input, attachments);
            const sync = await syncIssue(report.id);
            return { report, ...sync };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qk.feedback.all });
        },
    });
}

/**
 * Retry a stored/failed report from the list. The supervisor is idempotent:
 * an already-created issue is returned as-is, a stored/failed row gets a new
 * GitHub attempt, and GitHub being unconfigured is a non-fatal `issue: null`
 * result.
 */
export function useRetryFeedbackReport() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: qk.mutations.retryFeedback(),
        mutationFn: (reportId: string) => syncIssue(reportId),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: qk.feedback.all });
        },
    });
}
