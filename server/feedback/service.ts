/**
 * Feedback -> GitHub issues (Bun API).
 *
 * Handles both kinds stored in `feedback_reports`: bug reports (`kind=bug`)
 * and feature suggestions (`kind=feature`).
 *
 * Attachments are uploaded to GitHub *before* the PocketBase row exists: the
 * client POSTs them to `/api/feedback/upload`, this service stores each one as
 * an asset on the `feedback-assets` prerelease and returns
 * `{ name, url, size, type }`. The client then creates the report row with
 * those metadata in the `attachments` JSON field and POSTs `{ reportId }` to
 * `/api/feedback/report`. Nothing but metadata is ever written to PocketBase.
 *
 * The report flow:
 *
 *   1. re-fetches the report with the caller's token and still requires the
 *      caller to own it — the shared feature read rule lets the other account
 *      *read* a suggestion, never sync it,
 *   2. builds a sanitized Markdown issue body (attachments inline/links, plus
 *      a truncated AI chat transcript when a bug report attached one) and
 *      creates the issue with the server-held `GITHUB_TOKEN`,
 *   3. writes `status` / `issue_url` / `issue_number` back onto the report
 *      with the superuser token: `ownership.pb.js` strips those fields from
 *      caller updates, so a caller-token PATCH would answer 200 and save
 *      nothing (the bug that let 重新同步 open duplicate issues).
 *
 * `POST /api/feedback/issue-state` keeps the report's `issue_state` in sync
 * with GitHub. The feedback lists send at most 50 report ids; the service
 * re-reads each row with the caller's token, asks GitHub only for reports
 * that are `issue_created` and not already known `closed`, and writes the
 * result back (`issue_state` / `issue_state_checked`). Closed is terminal:
 * those rows are never checked again. Results are cached for a minute so two
 * visits in a row cost one GitHub request.
 *
 * If `GITHUB_TOKEN`/`GITHUB_REPO` is not configured the report is still
 * accepted: this returns `200 { issue: null }`, the row stays `stored`, and
 * the UI says 已收到反馈，暂未同步 GitHub. The upload endpoint answers 503
 * `{ reason: "github_not_configured" }` instead, so the client can tell the
 * user to submit without attachments. A GitHub failure is recorded as
 * `failed` and returned as 502, but the report itself is never lost.
 *
 * The GitHub token, the PocketBase token and raw provider responses never
 * reach the browser.
 */

import {
    FEEDBACK_ISSUE_STATE_PATH,
    FEEDBACK_REPORT_PATH,
    FEEDBACK_UPLOAD_PATH,
    type FeedbackIssueState,
    MAX_FEEDBACK_ATTACHMENTS,
    MAX_FEEDBACK_FILE_BYTES,
    MAX_FEEDBACK_ISSUE_STATE_REPORTS,
} from "../../lib/contracts/feedback";
import type { AuthUser } from "../http/auth";
import { HttpError } from "../http/errors";
import { createPbClient } from "../http/pb";
import { jsonResponse } from "../http/response";
import { createReportAdmin } from "./admin";
import { createGithubClient } from "./github";
import { createIssueStateLimiters } from "./limits";
import { readReport, withTranscript } from "./reports";
import type { FeedbackDeps, FeedbackReport } from "./types";

export {
    FEEDBACK_ISSUE_STATE_PATH,
    FEEDBACK_REPORT_PATH,
    FEEDBACK_UPLOAD_PATH,
};

/** PocketBase ids are 15 lowercase alphanumerics. */
const RECORD_ID_RE = /^[a-z0-9]{15}$/;
const ISSUE_STATE_CONCURRENCY = 5;

export type FeedbackService = {
    upload(request: Request, auth: AuthUser, form: FormData): Promise<Response>;
    report(request: Request, auth: AuthUser, body: unknown): Promise<Response>;
    issueStates(
        request: Request,
        auth: AuthUser,
        body: unknown,
    ): Promise<Response>;
};

function asRecord(value: unknown, message: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new HttpError(400, message, { code: "invalid_body" });
    }
    return value as Record<string, unknown>;
}

export function createFeedbackService(deps: FeedbackDeps): FeedbackService {
    const now = deps.now ?? Date.now;
    const pb = createPbClient({
        baseUrl: deps.pbBaseUrl,
        fetch: deps.fetch,
        adminEmail: deps.pbAdminEmail,
        adminPassword: deps.pbAdminPassword,
    });
    const github = createGithubClient({
        token: deps.githubToken,
        repo: deps.githubRepo,
        apiBase: deps.githubApiUrl,
        uploadsBase: deps.githubUploadsUrl,
        fetch: deps.fetch,
        now,
    });
    const admin = createReportAdmin(pb);
    const limiters = createIssueStateLimiters(now);
    const configured = github.configured;

    function checkIssueStateRate(uid: string): void {
        const minute = limiters.minute.check(uid);
        if (!minute.allowed) {
            throw new HttpError(429, "刷新太频繁，稍后再试", {
                code: "rate_limited",
                ...(minute.retryAfterSeconds
                    ? {
                          headers: {
                              "Retry-After": String(minute.retryAfterSeconds),
                          },
                      }
                    : {}),
            });
        }
        const daily = limiters.daily.check(uid);
        if (!daily.allowed) {
            throw new HttpError(429, "今天刷新的次数用完了", {
                code: "rate_limited",
            });
        }
    }

    /**
     * Sync the GitHub state of the reports currently on screen.
     *
     * Rows are re-read with the caller's token, so the collection rules stay
     * the visibility boundary (a shared feature suggestion is readable, the
     * other account's bug report is not). Only `issue_created` rows with a
     * usable issue number are considered. A persisted `closed` is terminal
     * and never spends a GitHub request; an `open`/unknown row is refreshed
     * (one minute of in-memory caching) and written back for the next visit.
     * GitHub failures omit the number, leaving the persisted badge alone.
     */
    async function issueStates(
        request: Request,
        auth: AuthUser,
        rawBody: unknown,
    ): Promise<Response> {
        checkIssueStateRate(auth.uid);

        const body = asRecord(rawBody, "请求内容不是合法 JSON");
        if (!Array.isArray(body.reportIds)) {
            throw new HttpError(400, "缺少反馈编号", {
                code: "invalid_body",
            });
        }
        const reportIds = Array.from(
            new Set(
                body.reportIds.filter(
                    (value): value is string =>
                        typeof value === "string" && RECORD_ID_RE.test(value),
                ),
            ),
        ).slice(0, MAX_FEEDBACK_ISSUE_STATE_REPORTS);
        if (reportIds.length === 0) {
            return jsonResponse(request, { ok: true, states: {} });
        }
        if (!configured) {
            return jsonResponse(request, {
                ok: true,
                states: {},
                reason: "github_not_configured",
            });
        }

        const states: Record<string, FeedbackIssueState> = {};
        for (
            let index = 0;
            index < reportIds.length;
            index += ISSUE_STATE_CONCURRENCY
        ) {
            const chunk = reportIds.slice(
                index,
                index + ISSUE_STATE_CONCURRENCY,
            );
            const results = await Promise.all(
                chunk.map(async (reportId) => {
                    const fetched = await readReport(pb, reportId, auth.token);
                    // Unreadable rows are another owner's bug reports (or
                    // deleted ones): skip them without exposing anything.
                    if (!fetched.ok) return null;
                    const report = fetched.report;
                    if (report.status !== "issue_created") return null;
                    const number = report.issue_number;
                    if (
                        typeof number !== "number" ||
                        !Number.isInteger(number) ||
                        number <= 0
                    ) {
                        return null;
                    }
                    if (report.issue_state === "closed") {
                        return { number, state: "closed" as const };
                    }
                    const state = await github.readIssueState(number);
                    if (!state) return null;
                    await admin.patchFields(
                        report.id,
                        {
                            issue_state: state,
                            issue_state_checked: new Date(now()).toISOString(),
                        },
                        auth.token,
                    );
                    return { number, state };
                }),
            );
            for (const result of results) {
                if (result) states[String(result.number)] = result.state;
            }
        }
        return jsonResponse(request, { ok: true, states });
    }

    async function upload(
        request: Request,
        auth: AuthUser,
        form: FormData,
    ): Promise<Response> {
        void auth;
        if (!configured) {
            throw new HttpError(
                503,
                "附件需要上传到 GitHub，但服务端还没有配置 GITHUB_TOKEN / GITHUB_REPO",
                {
                    code: "github_not_configured",
                    details: { ok: false, reason: "github_not_configured" },
                },
            );
        }
        const files = form
            .getAll("files")
            .filter(
                (value): value is File =>
                    value instanceof File && value.size > 0,
            );
        if (files.length === 0) {
            throw new HttpError(400, "没有收到附件", {
                code: "invalid_body",
            });
        }
        if (files.length > MAX_FEEDBACK_ATTACHMENTS) {
            throw new HttpError(
                400,
                `最多上传 ${MAX_FEEDBACK_ATTACHMENTS} 个附件`,
                { code: "invalid_body" },
            );
        }
        for (const file of files) {
            if (file.size > MAX_FEEDBACK_FILE_BYTES) {
                throw new HttpError(
                    413,
                    `单个附件不能超过 ${MAX_FEEDBACK_FILE_BYTES / 1024 / 1024}MB`,
                    { code: "payload_too_large" },
                );
            }
        }

        const release = await github.ensureRelease();
        if (!release.ok) {
            throw new HttpError(release.status, release.error, {
                code: "github_failed",
                details: { ok: false, reason: "github_failed" },
            });
        }
        const attachments = [];
        for (const file of files) {
            const uploaded = await github.uploadReleaseAsset(release.id, file);
            if (!uploaded.ok) {
                throw new HttpError(502, uploaded.error, {
                    code: "github_failed",
                    details: { ok: false, reason: "github_failed" },
                });
            }
            attachments.push(uploaded.attachment);
        }
        return jsonResponse(request, { ok: true, attachments });
    }

    async function report(
        request: Request,
        auth: AuthUser,
        rawBody: unknown,
    ): Promise<Response> {
        const body = asRecord(rawBody, "请求内容不是合法 JSON");
        const reportId =
            typeof body.reportId === "string" ? body.reportId.trim() : "";
        if (!RECORD_ID_RE.test(reportId)) {
            throw new HttpError(400, "反馈编号不对", {
                code: "invalid_body",
            });
        }

        const fetched = await readReport(pb, reportId, auth.token);
        if (!fetched.ok) {
            if (fetched.status === 0) {
                throw new HttpError(503, "反馈服务暂时不可用", {
                    code: "service_unavailable",
                });
            }
            // 403/404 from PB means "not your report"; don't distinguish.
            throw new HttpError(404, "找不到这条反馈", {
                code: "not_found",
            });
        }
        const reportRow = fetched.report;
        if (reportRow.owner !== auth.uid) {
            throw new HttpError(404, "找不到这条反馈", {
                code: "not_found",
            });
        }

        // Already synced (e.g. a retry): return the existing issue instead of
        // opening a duplicate one. Checked before any GitHub call so retrying
        // a successful submission never spends a GitHub request.
        if (reportRow.status === "issue_created" && reportRow.issue_url) {
            return jsonResponse(request, {
                ok: true,
                synced: true,
                issue: {
                    url: reportRow.issue_url,
                    number: reportRow.issue_number ?? null,
                },
                report: { id: reportRow.id, status: reportRow.status },
            });
        }

        if (!configured) {
            // The report itself is already stored; accepting it quietly is
            // deliberate so a missing token never loses a report. The user can
            // retry from the feedback list once GitHub is configured.
            return jsonResponse(request, {
                ok: true,
                synced: false,
                reason: "github_not_configured",
                issue: null,
                report: {
                    id: reportRow.id,
                    status: reportRow.status ?? "stored",
                },
            });
        }

        // A feature suggestion has no transcript requirement; skipping the
        // fetch also keeps the GitHub call fast. A bug report may attach one.
        const attached =
            reportRow.kind === "feature"
                ? { transcript: "", title: "" }
                : await withTranscript(pb, reportRow, auth.token);
        const created = await github.createIssue(
            reportRow,
            attached.transcript,
            attached.title,
        );
        if (!created.ok) {
            await admin.patchFields(
                reportRow.id,
                { status: "failed", error: created.error },
                auth.token,
            );
            throw new HttpError(502, created.error, {
                code: "github_failed",
                details: {
                    ok: false,
                    synced: false,
                    reason: "github_failed",
                    issue: null,
                    report: { id: reportRow.id, status: "failed" },
                },
            });
        }

        const updated = await admin.patchFields(
            reportRow.id,
            {
                status: "issue_created",
                issue_url: created.url,
                issue_number: created.number,
                error: "",
            },
            auth.token,
        );
        return jsonResponse(request, {
            ok: true,
            synced: true,
            issue: { url: created.url, number: created.number },
            report: {
                id: reportRow.id,
                status: updated
                    ? "issue_created"
                    : (reportRow.status ?? "stored"),
            },
        });
    }

    return { upload, report, issueStates };
}

export type { FeedbackReport };
