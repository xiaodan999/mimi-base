import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
    toChatConversation,
    type ChatConversationRecord,
} from "@/app/chat/records";
import type { ChatConversation } from "@/app/chat/types";
import { useCurrentUser } from "@/lib/auth";
import { apiUrl } from "@/lib/env";
import pb from "@/lib/pb";
import type { UserRecord } from "@/lib/pb-types";
import { qk } from "@/lib/query-keys";

import { getFeedbackErrors } from "./error-buffer";

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
    error?: string;
    screenshots?: string[];
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
    screenshots: File[];
    /** Bug reports only; feature suggestions never require a conversation. */
    conversationId?: string;
};

export type SubmitFeedbackResult = {
    /** The PocketBase row always exists once the mutation resolves. */
    report: FeedbackReportRecord;
    /** `null` when GitHub is not configured / unreachable / rate-limited. */
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

/**
 * Create the owner-scoped report (screenshots upload in this same request).
 * Status is always `stored` at create time; only the supervisor may flip it.
 */
async function createReport(
    userId: string,
    input: SubmitFeedbackInput,
): Promise<FeedbackReportRecord> {
    const form = new FormData();
    form.append("owner", userId);
    form.append("kind", input.kind);
    form.append("title", input.title);
    form.append("description", input.description);
    form.append("route", input.route);
    form.append("app_version", appVersion());
    form.append("app_sha", appSha());
    form.append("user_agent", navigator.userAgent);
    // Console output is a bug-report diagnostic; a feature idea does not need
    // it, and sending it would make the GitHub issue noisier for no reason.
    if (input.kind === "bug") {
        form.append("console", JSON.stringify(getFeedbackErrors()));
    }
    form.append("status", "stored");
    if (input.conversationId) {
        form.append("conversation", input.conversationId);
    }
    for (const file of input.screenshots) {
        form.append("screenshots", file);
    }

    const record = await pb
        .collection("feedback_reports")
        .create<FeedbackReportRecord>(form);
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
            const report = await createReport(user.id, input);
            const sync = await syncIssue(report.id);
            return { report, ...sync };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qk.feedback.all });
        },
    });
}
