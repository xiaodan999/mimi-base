/**
 * GitHub side of the feedback flow: issue create/read, the attachment
 * prerelease and its asset uploads.
 *
 * The release is created once (prerelease, tag `feedback-assets`) and reused;
 * concurrent first uploads share one in-flight promise. Issue state reads are
 * cached for a minute. Failures are returned to the caller (never thrown) so
 * a GitHub outage cannot lose a stored report.
 */

import { type Logger, logger as defaultLogger } from "../http/logger";
import {
    buildIssueBody,
    buildIssueTitle,
    cleanText,
    sanitizeAssetName,
} from "./markdown";
import type {
    FeedbackAttachment,
    FeedbackIssueState,
    FeedbackReport,
    IssueCreated,
    IssueFailure,
    ReleaseResult,
} from "./types";

const RELEASE_TAG = "feedback-assets";
const CONNECT_TIMEOUT_MS = 10_000;
/** Uploads are slower than JSON calls; give a 10MB asset room. */
const UPLOAD_TIMEOUT_MS = 60_000;
/** GitHub issue state is read for display only; a minute is plenty fresh. */
const ISSUE_STATE_CACHE_MS = 60_000;
const ISSUE_STATE_CACHE_MAX = 1000;

export type GithubClientOptions = {
    token: string;
    repo: string;
    apiBase?: string;
    uploadsBase?: string;
    fetch?: typeof fetch;
    now?: () => number;
    logger?: Logger;
};

export type GithubClient = {
    configured: boolean;
    readIssueState(number: number): Promise<FeedbackIssueState | null>;
    createIssue(
        report: FeedbackReport,
        transcript: string,
        conversationTitle: string,
    ): Promise<IssueCreated | IssueFailure>;
    ensureRelease(): Promise<ReleaseResult>;
    uploadReleaseAsset(
        release: number,
        file: File,
    ): Promise<
        | { ok: true; attachment: FeedbackAttachment }
        | { ok: false; error: string }
    >;
};

export function createGithubClient(options: GithubClientOptions): GithubClient {
    const fetchImpl = options.fetch ?? fetch;
    const now = options.now ?? Date.now;
    const log = (options.logger ?? defaultLogger).child("feedback:github");
    const apiBase = (
        options.apiBase?.trim() || "https://api.github.com"
    ).replace(/\/+$/, "");
    const uploadsBase = (
        options.uploadsBase?.trim() || "https://uploads.github.com"
    ).replace(/\/+$/, "");
    const repo = options.repo.trim();
    const token = options.token.trim();
    const configured = token !== "" && repo !== "";

    let releaseId: number | null = null;
    let releaseInFlight: Promise<ReleaseResult> | null = null;
    /** Makes asset names unique even within the same millisecond. */
    let assetSeq = 0;
    const issueStateCache = new Map<
        number,
        { state: FeedbackIssueState; expiresAt: number }
    >();

    function githubHeaders(
        extra: Record<string, string> = {},
    ): Record<string, string> {
        return {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "mimi-base-feedback",
            ...extra,
        };
    }

    async function readIssueState(
        number: number,
    ): Promise<FeedbackIssueState | null> {
        const cached = issueStateCache.get(number);
        if (cached && now() < cached.expiresAt) return cached.state;

        let response: Response;
        try {
            response = await fetchImpl(
                `${apiBase}/repos/${repo}/issues/${number}`,
                {
                    method: "GET",
                    headers: githubHeaders(),
                    signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
                },
            );
        } catch {
            log.warn("issue state read failed", { number, status: 0 });
            return null;
        }
        if (!response.ok) {
            log.warn("issue state read failed", {
                number,
                status: response.status,
            });
            return null;
        }
        let data: { state?: unknown };
        try {
            data = (await response.json()) as typeof data;
        } catch {
            log.warn("issue state unreadable", { number });
            return null;
        }
        const state =
            data.state === "open" || data.state === "closed"
                ? data.state
                : null;
        if (!state) {
            log.warn("issue state unknown", { number });
            return null;
        }
        if (issueStateCache.size >= ISSUE_STATE_CACHE_MAX) {
            issueStateCache.clear();
        }
        issueStateCache.set(number, {
            state,
            expiresAt: now() + ISSUE_STATE_CACHE_MS,
        });
        return state;
    }

    async function findRelease(): Promise<
        { ok: true; id: number } | { ok: false; status: number }
    > {
        let response: Response;
        try {
            response = await fetchImpl(
                `${apiBase}/repos/${repo}/releases/tags/${encodeURIComponent(RELEASE_TAG)}`,
                {
                    method: "GET",
                    headers: githubHeaders(),
                    signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
                },
            );
        } catch {
            return { ok: false, status: 0 };
        }
        if (!response.ok) return { ok: false, status: response.status };
        let data: { id?: unknown };
        try {
            data = (await response.json()) as typeof data;
        } catch {
            return { ok: false, status: 0 };
        }
        const id =
            typeof data.id === "number" && Number.isFinite(data.id)
                ? Math.floor(data.id)
                : 0;
        return id > 0 ? { ok: true, id } : { ok: false, status: 0 };
    }

    async function resolveRelease(): Promise<ReleaseResult> {
        const found = await findRelease();
        if (found.ok) {
            releaseId = found.id;
            return found;
        }
        if (found.status !== 404) {
            log.warn("release lookup failed", { status: found.status });
            return {
                ok: false,
                status: 502,
                error:
                    found.status === 0
                        ? "无法连接 GitHub"
                        : `无法读取 GitHub Release（HTTP ${found.status}）`,
            };
        }

        let response: Response;
        try {
            response = await fetchImpl(`${apiBase}/repos/${repo}/releases`, {
                method: "POST",
                headers: githubHeaders({ "content-type": "application/json" }),
                body: JSON.stringify({
                    tag_name: RELEASE_TAG,
                    name: "反馈附件",
                    body: "App 问题反馈 / 功能建议直接上传的附件。",
                    prerelease: true,
                }),
                signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
            });
        } catch {
            return { ok: false, status: 502, error: "无法连接 GitHub" };
        }
        if (response.status === 422) {
            // A concurrent request may have created the tag between our GET
            // and POST; re-read instead of failing the upload.
            const again = await findRelease();
            if (again.ok) {
                releaseId = again.id;
                return again;
            }
        }
        if (!response.ok) {
            log.warn("release create failed", { status: response.status });
            return {
                ok: false,
                status: 502,
                error: `GitHub 创建附件仓库失败（HTTP ${response.status}）`,
            };
        }
        let data: { id?: unknown };
        try {
            data = (await response.json()) as typeof data;
        } catch {
            return {
                ok: false,
                status: 502,
                error: "GitHub 返回了无法解析的结果",
            };
        }
        const id =
            typeof data.id === "number" && Number.isFinite(data.id)
                ? Math.floor(data.id)
                : 0;
        if (id <= 0) {
            return {
                ok: false,
                status: 502,
                error: "GitHub 没有返回 Release 编号",
            };
        }
        releaseId = id;
        return { ok: true, id };
    }

    async function ensureRelease(): Promise<ReleaseResult> {
        if (releaseId !== null) return { ok: true, id: releaseId };
        if (!releaseInFlight) {
            releaseInFlight = resolveRelease().finally(() => {
                releaseInFlight = null;
            });
        }
        return releaseInFlight;
    }

    /**
     * POST one asset to the release. Returns the public https URL GitHub
     * assigns. A failed upload aborts the whole request: the client then
     * shows "remove the attachments or retry" instead of creating a report
     * whose metadata points at missing assets.
     */
    async function uploadReleaseAsset(
        release: number,
        file: File,
    ): Promise<
        | { ok: true; attachment: FeedbackAttachment }
        | { ok: false; error: string }
    > {
        const safeName = sanitizeAssetName(file.name || "file");
        const uniqueName = `${now().toString(36)}-${(assetSeq++).toString(36)}-${safeName}`;
        const endpoint = `${uploadsBase}/repos/${repo}/releases/${release}/assets?name=${encodeURIComponent(uniqueName)}`;
        let response: Response;
        try {
            response = await fetchImpl(endpoint, {
                method: "POST",
                headers: githubHeaders({
                    "Content-Type": file.type || "application/octet-stream",
                }),
                body: await file.arrayBuffer(),
                signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
            });
        } catch {
            return { ok: false, error: "无法连接 GitHub 上传附件" };
        }
        if (!response.ok) {
            // Status only: the body can contain repository details.
            log.warn("asset upload failed", { status: response.status });
            return {
                ok: false,
                error: `GitHub 上传附件失败（HTTP ${response.status}）`,
            };
        }
        let data: { browser_download_url?: unknown };
        try {
            data = (await response.json()) as typeof data;
        } catch {
            return { ok: false, error: "GitHub 返回了无法解析的结果" };
        }
        const url =
            typeof data.browser_download_url === "string"
                ? data.browser_download_url.trim()
                : "";
        if (!/^https?:\/\//i.test(url)) {
            return { ok: false, error: "GitHub 没有返回附件链接" };
        }
        const name = cleanText(file.name, 200) || safeName;
        const type = cleanText(file.type, 100);
        return {
            ok: true,
            attachment: {
                name,
                url,
                size: file.size,
                ...(type ? { type } : {}),
            },
        };
    }

    async function createIssue(
        report: FeedbackReport,
        transcript: string,
        conversationTitle: string,
    ): Promise<IssueCreated | IssueFailure> {
        // Bug reports and feature suggestions share this one endpoint; the
        // kind picks the title prefix and labels.
        const payload = {
            title: buildIssueTitle(report.title, report.kind),
            body: buildIssueBody({
                report,
                transcript,
                conversationTitle,
            }),
            labels:
                report.kind === "feature"
                    ? ["enhancement", "from-app"]
                    : ["bug", "from-app"],
        };
        let response: Response;
        try {
            response = await fetchImpl(`${apiBase}/repos/${repo}/issues`, {
                method: "POST",
                headers: githubHeaders({ "content-type": "application/json" }),
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
            });
        } catch {
            return { ok: false, error: "无法连接 GitHub" };
        }
        if (!response.ok) {
            // Status only: the body can contain repository details.
            log.warn("issue create failed", { status: response.status });
            return {
                ok: false,
                error: `GitHub 创建 Issue 失败（HTTP ${response.status}）`,
            };
        }
        let data: { html_url?: unknown; number?: unknown };
        try {
            data = (await response.json()) as typeof data;
        } catch {
            return { ok: false, error: "GitHub 返回了无法解析的结果" };
        }
        const url = typeof data.html_url === "string" ? data.html_url : "";
        const number =
            typeof data.number === "number" && Number.isFinite(data.number)
                ? Math.floor(data.number)
                : 0;
        if (!url || number <= 0) {
            return { ok: false, error: "GitHub 没有返回 Issue 链接" };
        }
        return { ok: true, url, number };
    }

    return {
        configured,
        readIssueState,
        createIssue,
        ensureRelease,
        uploadReleaseAsset,
    };
}
