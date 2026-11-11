import { describe, expect, test } from "bun:test";

import {
    asAttachmentArray,
    buildIssueBody,
    buildIssueTitle,
    buildTranscript,
    cleanText,
    createFeedbackService,
    FEEDBACK_ISSUE_STATE_PATH,
    FEEDBACK_REPORT_PATH,
    FEEDBACK_UPLOAD_PATH,
    type FeedbackDeps,
    type FeedbackReport,
    formatBytes,
    formatConsoleErrors,
    messageText,
    sanitizeAssetName,
} from "./feedback";

const PB_BASE = "http://127.0.0.1:8090";
const UID = "user1234567890";
const REPORT_ID = "report123456789";

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function report(overrides: Partial<FeedbackReport> = {}): FeedbackReport {
    return {
        id: REPORT_ID,
        owner: UID,
        kind: "bug",
        title: "首页闪退",
        description: "打开首页后白屏，刷新也没用。",
        route: "/home",
        app_version: "0.0.1",
        app_sha: "abc1234",
        user_agent: "Mozilla/5.0 (iPhone)",
        console: [
            {
                kind: "error",
                message: "TypeError: cannot read properties of undefined",
                source: "home.tsx:42",
                at: "2026-11-09T10:00:00.000Z",
            },
        ],
        status: "stored",
        attachments: [
            {
                name: "shot-one.png",
                url: "https://github.com/owner/repo/releases/download/feedback-assets/one.png",
                size: 2048,
                type: "image/png",
            },
            {
                name: "log.txt",
                url: "https://github.com/owner/repo/releases/download/feedback-assets/log.txt",
                size: 1200,
                type: "text/plain",
            },
        ],
        ...overrides,
    };
}

const FILE_ONE =
    "https://github.com/owner/repo/releases/download/feedback-assets/one.png";
const FILE_TWO =
    "https://github.com/owner/repo/releases/download/feedback-assets/two.png";
const FILE_LOG =
    "https://github.com/owner/repo/releases/download/feedback-assets/log.txt";

type MockCall = { url: URL; init?: RequestInit };

function setup(
    handler: (url: URL, init?: RequestInit) => Response | Promise<Response>,
    overrides: Partial<FeedbackDeps> = {},
) {
    const calls: MockCall[] = [];
    const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        calls.push({ url, init });
        if (url.pathname === "/api/collections/users/auth-refresh") {
            return json({ record: { id: UID } });
        }
        return handler(url, init);
    }) as typeof fetch;

    const service = createFeedbackService({
        pbBaseUrl: PB_BASE,
        githubToken: "github-token",
        githubRepo: "owner/repo",
        githubApiUrl: "https://github.test",
        githubUploadsUrl: "https://uploads.github.test",
        fetch: fetchMock,
        ...overrides,
    });
    return { service, calls };
}

function submit(token: string | null = "pb-token", id = REPORT_ID) {
    const headers: Record<string, string> = {
        "content-type": "application/json",
    };
    if (token) headers.Authorization = token;
    return new Request(`http://supervisor${FEEDBACK_REPORT_PATH}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ reportId: id }),
    });
}

function issueStateRequest(
    reportIds: unknown[],
    token: string | null = "pb-token",
) {
    const headers: Record<string, string> = {
        "content-type": "application/json",
    };
    if (token) headers.Authorization = token;
    return new Request(`http://supervisor${FEEDBACK_ISSUE_STATE_PATH}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ reportIds }),
    });
}

/** 15-char PocketBase-style id; `index` keeps each row distinct. */
function issueReportId(index: number): string {
    return `report${String(index).padStart(9, "0")}`;
}

/** A synced report row as PocketBase would return it. */
function syncedReport(
    index: number,
    number: number,
    overrides: Partial<FeedbackReport> = {},
): FeedbackReport {
    return report({
        id: issueReportId(index),
        status: "issue_created",
        issue_url: `https://github.test/owner/repo/issues/${number}`,
        issue_number: number,
        ...overrides,
    });
}

/**
 * PB report rows + superuser auth + GitHub issue reads for the state tests.
 * `state` is mutable so assertions can inspect PATCHes and request counts.
 */
function issueStatePb(input: {
    rows?: FeedbackReport[];
    github?: (number: number) => Response;
    adminStatus?: number;
    patchStatus?: number;
}) {
    const state = {
        patches: [] as Array<{
            id: string;
            body: Record<string, unknown>;
            auth: string;
        }>,
        adminAuths: 0,
        githubCalls: 0,
    };
    const rows = new Map(
        (input.rows ?? []).map((row) => [row.id, row] as const),
    );
    const handler = (url: URL, init?: RequestInit): Response => {
        if (
            url.pathname === "/api/collections/_superusers/auth-with-password"
        ) {
            state.adminAuths += 1;
            const status = input.adminStatus ?? 200;
            return status === 200
                ? json({ token: "admin-token" })
                : json({}, status);
        }
        const record = url.pathname.match(
            /^\/api\/collections\/feedback_reports\/records\/([a-z0-9]+)$/,
        );
        if (record) {
            if (init?.method === "PATCH") {
                const headers = (init.headers ?? {}) as Record<string, string>;
                state.patches.push({
                    id: record[1],
                    body: JSON.parse(String(init.body)) as Record<
                        string,
                        unknown
                    >,
                    auth: headers.Authorization ?? "",
                });
                const status = input.patchStatus ?? 200;
                return status === 200
                    ? json({ id: record[1] })
                    : json({}, status);
            }
            const row = rows.get(record[1]);
            return row ? json(row) : json({}, 404);
        }
        const issue = url.pathname.match(
            /^\/repos\/owner\/repo\/issues\/(\d+)$/,
        );
        if (issue) {
            state.githubCalls += 1;
            return input.github
                ? input.github(Number(issue[1]))
                : json({ state: "open" });
        }
        return json({}, 404);
    };
    return { state, handler };
}

/** PB report fetch + option transcript rows + optional GitHub/PATCH hooks. */
function pbHandler(options: {
    report?: FeedbackReport | null;
    reportStatus?: number;
    conversationStatus?: number;
    messages?: unknown[];
    onPatch?: (body: unknown) => void;
    onGithub?: (url: URL, init: RequestInit) => Response;
    githubStatus?: number;
}) {
    return (url: URL, init?: RequestInit): Response => {
        if (
            url.pathname ===
            `/api/collections/feedback_reports/records/${REPORT_ID}`
        ) {
            if (init?.method === "PATCH") {
                options.onPatch?.(JSON.parse(String(init.body)));
                return json({ id: REPORT_ID });
            }
            if (options.reportStatus && options.reportStatus !== 200) {
                return json({}, options.reportStatus);
            }
            return json(options.report ?? report());
        }
        if (
            url.pathname.startsWith(
                "/api/collections/chat_conversations/records/",
            )
        ) {
            if (options.conversationStatus) {
                return json({}, options.conversationStatus);
            }
            return json({ id: "conv1234567890", title: "聊天标题" });
        }
        if (url.pathname === "/api/collections/chat_messages/records") {
            return json({ items: options.messages ?? [] });
        }
        if (url.pathname === "/repos/owner/repo/issues") {
            options.onGithub?.(url, init!);
            if (options.githubStatus && options.githubStatus !== 201) {
                return json({ message: "boom" }, options.githubStatus);
            }
            return json(
                {
                    html_url: "https://github.test/owner/repo/issues/7",
                    number: 7,
                },
                201,
            );
        }
        return json({}, 404);
    };
}

function uploadRequest(
    files: Array<{
        name: string;
        type?: string;
        data?: string | Uint8Array;
    }>,
    token: string | null = "pb-token",
): Request {
    const form = new FormData();
    for (const file of files) {
        const data = file.data ?? "hello";
        const part: BlobPart =
            typeof data === "string" ? data : new Uint8Array(data).buffer;
        form.append(
            "files",
            new File([part], file.name, {
                type: file.type ?? "text/plain",
            }),
        );
    }
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = token;
    return new Request(`http://supervisor${FEEDBACK_UPLOAD_PATH}`, {
        method: "POST",
        headers,
        body: form,
    });
}

type AssetCall = { url: URL; init?: RequestInit };

/** Mock release + asset endpoints; issue/report routes stay 404. */
function githubUploads(options: {
    releaseFound?: boolean;
    releaseId?: number;
    createReleaseStatus?: number;
    assetStatus?: number;
    onAsset?: (call: AssetCall) => void;
    onCreateRelease?: (init?: RequestInit) => void;
}) {
    const releaseId = options.releaseId ?? 1;
    return (url: URL, init?: RequestInit): Response => {
        if (
            url.pathname === "/repos/owner/repo/releases/tags/feedback-assets"
        ) {
            if (options.releaseFound) return json({ id: releaseId });
            return json({ message: "Not Found" }, 404);
        }
        if (url.pathname === "/repos/owner/repo/releases") {
            options.onCreateRelease?.(init);
            if (
                options.createReleaseStatus &&
                options.createReleaseStatus !== 201
            ) {
                return json({ message: "boom" }, options.createReleaseStatus);
            }
            return json({ id: releaseId }, 201);
        }
        if (url.pathname === `/repos/owner/repo/releases/${releaseId}/assets`) {
            options.onAsset?.({ url, init });
            if (options.assetStatus && options.assetStatus !== 201) {
                return json({ message: "boom" }, options.assetStatus);
            }
            const name = url.searchParams.get("name") ?? "asset";
            return json(
                {
                    browser_download_url: `https://github.com/owner/repo/releases/download/feedback-assets/${name}`,
                },
                201,
            );
        }
        return json({}, 404);
    };
}

describe("attachment helpers", () => {
    test("asAttachmentArray drops unsafe URLs and caps the list", () => {
        expect(
            asAttachmentArray([
                { name: "a.png", url: FILE_ONE, size: 12.9, type: "image/png" },
                { name: "b", url: "javascript:alert(1)" },
                { name: "c", url: "http://example.com/x" },
                { name: "d", url: `${FILE_TWO})` },
                { name: "", url: FILE_TWO },
            ]),
        ).toEqual([
            { name: "a.png", url: FILE_ONE, size: 12, type: "image/png" },
            { name: "附件", url: FILE_TWO },
        ]);
        expect(asAttachmentArray("not json")).toEqual([]);
        expect(
            asAttachmentArray(
                Array.from({ length: 5 }, (_, index) => ({
                    name: `f-${index}`,
                    url: `${FILE_ONE}?n=${index}`,
                })),
            ),
        ).toHaveLength(3);
    });

    test("sanitizeAssetName keeps a safe ASCII name and extension", () => {
        expect(sanitizeAssetName("截图 2026.png")).toBe("2026.png");
        expect(sanitizeAssetName("../../etc/passwd")).toBe("passwd");
        expect(sanitizeAssetName("a b(c)*.TXT")).toBe("a-b-c.txt");
        expect(sanitizeAssetName("")).toBe("file");
        expect(sanitizeAssetName("x".repeat(300) + ".log")).toHaveLength(104);
    });

    test("formatBytes", () => {
        expect(formatBytes(512)).toBe("512 B");
        expect(formatBytes(1536)).toBe("1.5 KB");
        expect(formatBytes(12 * 1024)).toBe("12 KB");
        expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
    });
});

describe("cleanText", () => {
    test("strips control characters, trims and caps", () => {
        expect(cleanText("  a\u0000b\u001fc\n\nd  ", 10)).toBe("abc\n\nd");
        expect(cleanText("abcdef", 3)).toBe("abc");
        expect(cleanText(undefined, 5)).toBe("");
    });
});

describe("buildIssueTitle", () => {
    test("prefixes the title and caps its length", () => {
        expect(buildIssueTitle("首页闪退")).toBe("[Bug] 首页闪退");
        expect(buildIssueTitle("x".repeat(400))).toHaveLength(180);
        expect(
            buildIssueTitle("新功能", "feature").startsWith("[Feature]"),
        ).toBe(true);
    });
});

describe("buildIssueBody", () => {
    test("includes description, context, attachments and console errors", () => {
        const body = buildIssueBody({
            report: report(),
            now: new Date("2026-11-09T12:00:00.000Z"),
        });
        expect(body).toContain("打开首页后白屏");
        expect(body).toContain("`/home`");
        expect(body).toContain("0.0.1 (abc1234)");
        expect(body).toContain("2026-11-09T12:00:00.000Z");
        expect(body).toContain("Mozilla/5.0 (iPhone)");
        expect(body).toContain("- 附件：2 个（已上传到 GitHub）");
        expect(body).toContain(
            "TypeError: cannot read properties of undefined",
        );
        expect(body).toContain("控制台 / 页面错误");
        expect(body).toContain("关联 AI 对话：未附加");
        expect(body).not.toContain("保存在 App");
    });

    test("renders images inline and other files as links with size", () => {
        const body = buildIssueBody({ report: report() });
        expect(body).toContain("### 附件");
        expect(body).toContain(`![shot-one.png](${FILE_ONE})`);
        expect(body).toContain(`- [log.txt](${FILE_LOG})`);
        expect(body).toContain("(1.2 KB)");
    });

    test("accepts a JSON string and drops unsafe or malformed entries", () => {
        const body = buildIssueBody({
            report: report({
                attachments: JSON.stringify([
                    { name: "ok.png", url: FILE_ONE, type: "image/png" },
                    { name: "js", url: "javascript:alert(1)" },
                    { name: "http", url: "http://example.com/a.png" },
                    { name: "evil", url: `${FILE_TWO})` },
                    null,
                    "x",
                ]),
            }),
        });
        expect(body).toContain("### 附件");
        expect(body).toContain(`![ok.png](${FILE_ONE})`);
        expect(body).not.toContain("javascript:");
        expect(body).not.toContain("http://example.com");
    });

    test("escapes Markdown-sensitive attachment names", () => {
        const body = buildIssueBody({
            report: report({
                attachments: [
                    {
                        name: "a[b]*c*_d_<e>.png",
                        url: FILE_ONE,
                        type: "image/png",
                    },
                ],
            }),
        });
        expect(body).toContain(
            `![a\\[b\\]\\*c\\*\\_d\\_\\<e\\>.png](${FILE_ONE})`,
        );
    });

    test("says 附件：无 when a report has no attachments", () => {
        const body = buildIssueBody({
            report: report({ attachments: [] }),
        });
        expect(body).toContain("- 附件：无");
        expect(body).not.toContain("### 附件");
    });

    test("includes the transcript and conversation title when attached", () => {
        const body = buildIssueBody({
            report: report({ conversation: "conv1234567890" }),
            conversationTitle: "登录问题",
            transcript: buildTranscript("登录问题", [
                { role: "user", text: "登录一直失败" },
                { role: "assistant", text: "试试刷新页面" },
            ]),
        });
        expect(body).toContain("关联 AI 对话：登录问题");
        expect(body).toContain("附带的 AI 对话");
        expect(body).toContain("**用户**：\n\n登录一直失败");
        expect(body).toContain("<details>");
    });

    test("describes a feature suggestion without bug-only sections", () => {
        const body = buildIssueBody({
            report: report({
                kind: "feature",
                title: "想要每日一句",
                description:
                    "想要什么：首页每天一句。\n为什么：早上想被鼓励一下。\n希望怎么用：打开首页就能看到。",
                route: "/feedback",
                attachments: [
                    {
                        name: "idea-one.png",
                        url: FILE_ONE,
                        size: 4096,
                        type: "image/png",
                    },
                    {
                        name: "idea-two.png",
                        url: FILE_TWO,
                        size: 4096,
                        type: "image/png",
                    },
                ],
                console: [{ kind: "error", message: "feature console noise" }],
            }),
            now: new Date("2026-11-09T12:00:00.000Z"),
        });
        expect(body).toContain("想要什么：首页每天一句");
        expect(body).toContain("### 建议信息");
        expect(body).toContain("- 类型：功能建议");
        expect(body).toContain("- 附件：2 个（已上传到 GitHub）");
        expect(body).toContain(`![idea-one.png](${FILE_ONE})`);
        expect(body).not.toContain("保存在 App");
        // Feature bodies never include a transcript or console dump.
        expect(body).not.toContain("关联 AI 对话");
        expect(body).not.toContain("控制台");
        expect(body).not.toContain("feature console noise");
    });

    test("truncates a huge description and body", () => {
        const body = buildIssueBody({
            report: report({ description: "长".repeat(20_000) }),
            transcript: `### transcript\n${"t".repeat(80_000)}`,
        });
        expect(body.length).toBeLessThanOrEqual(60_000);
        expect(body.endsWith("\n\n…（内容过长，已截断）")).toBe(true);
        expect(body).not.toContain("长".repeat(6000));
    });

    test("drops empty console entries", () => {
        expect(formatConsoleErrors([])).toBe("");
        expect(formatConsoleErrors([{ message: "  " }])).toBe("");
        expect(formatConsoleErrors([{ kind: "error", message: "boom" }])).toBe(
            "- [error] boom",
        );
    });
});

describe("buildTranscript", () => {
    test("caps the transcript to the most recent 20 messages", () => {
        const messages = Array.from({ length: 25 }, (_, index) => ({
            role: index % 2 === 0 ? "user" : "assistant",
            text: `message-${index}`,
        }));
        const transcript = buildTranscript("长对话", messages);
        expect(transcript).toContain("message-24");
        expect(transcript).toContain("message-5");
        expect(transcript).not.toContain("message-4");
        expect(transcript).toContain("更早的 5 条消息已省略");
    });

    test("keeps the newest messages under the 10k cap", () => {
        const messages = Array.from({ length: 20 }, (_, index) => ({
            role: "user",
            text: `#${index}#${"x".repeat(900)}`,
        }));
        const transcript = buildTranscript("很长的对话", messages);
        expect(transcript.length).toBeLessThan(11_000);
        expect(transcript).toContain("#19#");
        expect(transcript).not.toContain("#0#");
        expect(transcript).toContain("条消息已省略");
    });

    test("keeps a truncated newest message when it alone exceeds the cap", () => {
        const transcript = buildTranscript("巨长消息", [
            { role: "user", text: "start-" + "y".repeat(20_000) },
        ]);
        expect(transcript.length).toBeLessThan(11_000);
        expect(transcript).toContain("start-");
        // The per-message cap (4k) keeps a single huge message inside the
        // transcript cap, so nothing is omitted.
        expect(transcript).toContain("共 1 条消息");
    });

    test("returns empty for no messages and escapes the title", () => {
        expect(buildTranscript("x", [])).toBe("");
        expect(
            buildTranscript("a`b", [{ role: "user", text: "hi" }]),
        ).toContain("a'b");
    });
});

describe("messageText", () => {
    test("joins text parts and ignores tool/image parts", () => {
        expect(
            messageText([
                { type: "text", text: "hello" },
                { type: "tool-call", toolName: "sandbox_run" },
                { type: "text", text: "world" },
                { type: "image", image: "x" },
            ]),
        ).toBe("hello\n\nworld");
        expect(messageText([{ type: "text", text: "  " }])).toBe("");
    });
});

describe("feedback service", () => {
    test("returns null for unrelated paths", async () => {
        const { service } = setup(pbHandler({}));
        expect(
            await service(
                new Request("http://supervisor/api/ai/models", {
                    method: "GET",
                }),
            ),
        ).toBeNull();
    });

    test("rejects missing or invalid tokens without touching PB data", async () => {
        const { service, calls } = setup(pbHandler({}));
        const res = await service(submit(null));
        expect(res?.status).toBe(401);
        // Only the auth-refresh itself (no token -> not even that).
        expect(calls).toHaveLength(0);

        const bad = await service(submit(""));
        expect(bad?.status).toBe(401);
    });

    test("fetches the report with the caller token and enforces owner scope", async () => {
        const { service, calls } = setup(
            pbHandler({ report: report({ owner: "someoneelse123" }) }),
        );
        const res = await service(submit());
        expect(res?.status).toBe(404);
        const recordCall = calls.find((call) =>
            call.url.pathname.includes("/feedback_reports/records/"),
        );
        expect(recordCall?.init?.headers).toEqual({
            Authorization: "pb-token",
        });
        // No GitHub issue was created for another owner's report.
        expect(
            calls.some((call) => call.url.pathname.endsWith("/issues")),
        ).toBe(false);
    });

    test("404s a report PocketBase refuses to show", async () => {
        const { service } = setup(pbHandler({ reportStatus: 404 }));
        const res = await service(submit());
        expect(res?.status).toBe(404);
    });

    test("creates the GitHub issue and writes the result back", async () => {
        let github: { url: URL; init: RequestInit } | null = null;
        let patched: unknown;
        const { service, calls } = setup(
            pbHandler({
                report: report({ conversation: "conv1234567890" }),
                messages: [
                    { role: "user", parts: [{ type: "text", text: "你好" }] },
                    {
                        role: "assistant",
                        parts: [{ type: "text", text: "有什么可以帮你？" }],
                    },
                ],
                onPatch: (body) => {
                    patched = body;
                },
                onGithub: (url, init) => {
                    github = { url, init };
                    return json({}, 201);
                },
            }),
            { githubApiUrl: "https://github.test/" },
        );
        const res = await service(submit());
        expect(res?.status).toBe(200);
        const body = (await res!.json()) as {
            ok: boolean;
            issue: { url: string; number: number };
        };
        expect(body.ok).toBe(true);
        expect(body.issue).toEqual({
            url: "https://github.test/owner/repo/issues/7",
            number: 7,
        });

        const captured = github as { url: URL; init: RequestInit } | null;
        expect(captured?.url.pathname).toBe("/repos/owner/repo/issues");
        const headers = captured?.init.headers as Record<string, string>;
        expect(headers.Authorization).toBe("Bearer github-token");
        expect(headers.Accept).toBe("application/vnd.github+json");
        expect(headers["User-Agent"]).toBe("mimi-base-feedback");
        const payload = JSON.parse(String(captured?.init.body)) as {
            title: string;
            body: string;
            labels: string[];
        };
        expect(payload.title).toBe("[Bug] 首页闪退");
        expect(payload.labels).toEqual(["bug", "from-app"]);
        expect(payload.body).toContain("打开首页后白屏");
        // The row's stored metadata is enough to rebuild the attachment
        // section on a retry — no bytes are fetched again.
        expect(payload.body).toContain("### 附件");
        expect(payload.body).toContain(`![shot-one.png](${FILE_ONE})`);

        expect(patched).toEqual({
            status: "issue_created",
            issue_url: "https://github.test/owner/repo/issues/7",
            issue_number: 7,
            error: "",
        });
        // Conversation rows are fetched with the same caller token.
        const messageCall = calls.find((call) =>
            call.url.pathname.endsWith("/chat_messages/records"),
        );
        expect(messageCall?.init?.headers).toEqual({
            Authorization: "pb-token",
        });
    });

    test("creates a [Feature] issue with enhancement labels and no transcript", async () => {
        let github: { url: URL; init: RequestInit } | null = null;
        let patched: unknown;
        const { service, calls } = setup(
            pbHandler({
                report: report({
                    kind: "feature",
                    title: "想要每日一句",
                    description:
                        "想要什么：首页每天一句。\n为什么：早上想被鼓励。\n希望怎么用：打开就能看到。",
                    route: "/feedback",
                    attachments: [
                        {
                            name: "idea-one.png",
                            url: FILE_ONE,
                            type: "image/png",
                        },
                        {
                            name: "idea-two.png",
                            url: FILE_TWO,
                            type: "image/png",
                        },
                    ],
                    console: [],
                    // Even if a feature row somehow carries a conversation,
                    // the feature path must not fetch a transcript.
                    conversation: "conv1234567890",
                }),
                onPatch: (body) => {
                    patched = body;
                },
                onGithub: (url, init) => {
                    github = { url, init };
                    return json({}, 201);
                },
            }),
        );
        const res = await service(submit());
        expect(res?.status).toBe(200);
        const body = (await res!.json()) as {
            ok: boolean;
            issue: { url: string; number: number };
        };
        expect(body.ok).toBe(true);
        expect(body.issue.number).toBe(7);

        const captured = github as { url: URL; init: RequestInit } | null;
        const payload = JSON.parse(String(captured?.init.body)) as {
            title: string;
            body: string;
            labels: string[];
        };
        expect(payload.title).toBe("[Feature] 想要每日一句");
        expect(payload.labels).toEqual(["enhancement", "from-app"]);
        expect(payload.body).toContain("想要什么：首页每天一句");
        expect(payload.body).toContain("- 附件：2 个（已上传到 GitHub）");
        expect(payload.body).toContain(`![idea-one.png](${FILE_ONE})`);
        expect(payload.body).not.toContain("附带的 AI 对话");
        expect(payload.body).not.toContain("关联 AI 对话");

        expect(patched).toEqual({
            status: "issue_created",
            issue_url: "https://github.test/owner/repo/issues/7",
            issue_number: 7,
            error: "",
        });
        // No chat_conversations / chat_messages reads on the feature path.
        expect(
            calls.some((call) =>
                call.url.pathname.includes("/chat_conversations/records/"),
            ),
        ).toBe(false);
        expect(
            calls.some((call) =>
                call.url.pathname.includes("/chat_messages/records"),
            ),
        ).toBe(false);
    });

    test("attaches a truncated transcript fetched through the caller token", async () => {
        let payload: { body: string } | null = null;
        const messages = Array.from({ length: 25 }, (_, index) => ({
            role: index % 2 === 0 ? "user" : "assistant",
            parts: [{ type: "text", text: `line-${index}` }],
        }));
        const { service } = setup(
            pbHandler({
                report: report({ conversation: "conv1234567890" }),
                messages,
                onGithub: (_url, init) => {
                    payload = JSON.parse(String(init.body)) as {
                        body: string;
                    };
                    return json({}, 201);
                },
            }),
        );
        const res = await service(submit());
        expect(res?.status).toBe(200);
        const body = (payload as { body: string } | null)?.body ?? "";
        expect(body).toContain("附带的 AI 对话");
        expect(body).toContain("**用户**：");
        expect(body).toContain("line-24");
        expect(body).toContain("更早的 5 条消息已省略");
        expect(body).toContain("<details>");
    });

    test("still creates the issue when the conversation is unreadable", async () => {
        let payload: { body: string } | null = null;
        const { service } = setup(
            pbHandler({
                report: report({ conversation: "conv1234567890" }),
                conversationStatus: 404,
                onGithub: (_url, init) => {
                    payload = JSON.parse(String(init.body)) as {
                        body: string;
                    };
                    return json({}, 201);
                },
            }),
        );
        const res = await service(submit());
        expect(res?.status).toBe(200);
        const body = (payload as { body: string } | null)?.body ?? "";
        expect(body).toContain("关联 AI 对话：已附加");
        expect(body).not.toContain("附带的 AI 对话");
    });

    test("missing GITHUB_TOKEN accepts the stored report without syncing", async () => {
        const { service, calls } = setup(pbHandler({}), {
            githubToken: "",
        });
        const res = await service(submit());
        expect(res?.status).toBe(200);
        const body = (await res!.json()) as {
            ok: boolean;
            issue: null;
            synced: boolean;
            reason: string;
            report: { id: string; status: string };
        };
        expect(body).toEqual({
            ok: true,
            synced: false,
            reason: "github_not_configured",
            issue: null,
            report: { id: REPORT_ID, status: "stored" },
        });
        expect(
            calls.some((call) => call.url.pathname.endsWith("/issues")),
        ).toBe(false);
        expect(calls.some((call) => call.init?.method === "PATCH")).toBe(false);
    });

    test("missing GITHUB_REPO is also treated as not configured", async () => {
        const { service, calls } = setup(pbHandler({}), { githubRepo: "" });
        const res = await service(submit());
        expect(res?.status).toBe(200);
        expect(((await res!.json()) as { issue: unknown }).issue).toBeNull();
        expect(
            calls.some((call) => call.url.pathname.endsWith("/issues")),
        ).toBe(false);
    });

    test("marks the report failed when GitHub errors", async () => {
        let patched: { status?: string; error?: string } = {};
        const { service } = setup(
            pbHandler({
                githubStatus: 500,
                onPatch: (body) => {
                    patched = body as typeof patched;
                },
            }),
        );
        const res = await service(submit());
        expect(res?.status).toBe(502);
        const body = (await res!.json()) as {
            ok: boolean;
            issue: null;
            error: string;
        };
        expect(body.ok).toBe(false);
        expect(body.issue).toBeNull();
        expect(body.error).toContain("HTTP 500");
        expect(patched.status).toBe("failed");
        expect(patched.error).toContain("HTTP 500");
    });

    test("does not open a duplicate issue for an already-synced report", async () => {
        const { service, calls } = setup(
            pbHandler({
                report: report({
                    status: "issue_created",
                    issue_url: "https://github.test/owner/repo/issues/3",
                    issue_number: 3,
                }),
            }),
        );
        const res = await service(submit());
        expect(res?.status).toBe(200);
        const body = (await res!.json()) as {
            issue: { url: string; number: number };
        };
        expect(body.issue).toEqual({
            url: "https://github.test/owner/repo/issues/3",
            number: 3,
        });
        expect(
            calls.some((call) => call.url.pathname.endsWith("/issues")),
        ).toBe(false);
    });

    test("accepts more than five consecutive submissions (no per-user cap)", async () => {
        const issues: number[] = [];
        const { service, calls } = setup((url, init) => {
            if (
                url.pathname.startsWith(
                    "/api/collections/feedback_reports/records/",
                )
            ) {
                if (init?.method === "PATCH") return json({ id: REPORT_ID });
                const id = url.pathname.split("/").pop() ?? REPORT_ID;
                return json(report({ id }));
            }
            if (url.pathname === "/repos/owner/repo/issues") {
                const number = issues.length + 1;
                issues.push(number);
                return json(
                    {
                        html_url: `https://github.test/owner/repo/issues/${number}`,
                        number,
                    },
                    201,
                );
            }
            return json({}, 404);
        });

        // Six distinct new reports in a row: the old 5/hour limiter answered
        // 429 on the sixth. Each one must create its own issue and return 200.
        for (let attempt = 0; attempt < 6; attempt += 1) {
            const id = `report${String(attempt).padStart(9, "0")}`;
            const res = await service(submit("pb-token", id));
            expect(res?.status).toBe(200);
            const body = (await res!.json()) as {
                synced: boolean;
                issue: { number: number } | null;
            };
            expect(body.synced).toBe(true);
            expect(body.issue?.number).toBe(attempt + 1);
        }
        expect(issues).toHaveLength(6);
        expect(
            calls.filter((call) => call.url.pathname.endsWith("/issues")),
        ).toHaveLength(6);
    });

    test("already-synced retries reuse the existing issue", async () => {
        let current: FeedbackReport = report({
            status: "issue_created",
            issue_url: "https://github.test/owner/repo/issues/3",
            issue_number: 3,
        });
        const { service } = setup((url, init) => {
            if (
                url.pathname ===
                `/api/collections/feedback_reports/records/${REPORT_ID}`
            ) {
                if (init?.method === "PATCH") return json({ id: REPORT_ID });
                return json(current);
            }
            if (url.pathname === "/repos/owner/repo/issues") {
                return json(
                    {
                        html_url: "https://github.test/owner/repo/issues/9",
                        number: 9,
                    },
                    201,
                );
            }
            return json({}, 404);
        });

        // Already-synced reports reuse their issue without a new GitHub call.
        for (let attempt = 0; attempt < 6; attempt += 1) {
            expect((await service(submit()))?.status).toBe(200);
        }

        current = report();
        const res = await service(submit());
        expect(res?.status).toBe(200);
        const body = (await res!.json()) as {
            issue: { number: number } | null;
        };
        expect(body.issue?.number).toBe(9);
    });

    test("rejects malformed ids and bodies", async () => {
        const { service } = setup(pbHandler({}));
        const badId = await service(submit("pb-token", "short"));
        expect(badId?.status).toBe(400);
        const badJson = await service(
            new Request(`http://supervisor${FEEDBACK_REPORT_PATH}`, {
                method: "POST",
                headers: { Authorization: "pb-token" },
                body: "{",
            }),
        );
        expect(badJson?.status).toBe(400);
        const notFound = await service(
            new Request("http://supervisor/api/feedback/nope", {
                method: "POST",
            }),
        );
        expect(notFound?.status).toBe(404);
    });
});

describe("feedback issue state service", () => {
    test("reads each pending report and persists the state with the admin token", async () => {
        const { state, handler } = issueStatePb({
            rows: [syncedReport(1, 7), syncedReport(2, 8)],
            github: (number) =>
                json({ state: number === 8 ? "closed" : "open" }),
        });
        const { service } = setup(handler, {
            pbAdminEmail: "admin@test",
            pbAdminPassword: "pw",
        });

        const res = await service(
            issueStateRequest([issueReportId(1), issueReportId(2)]),
        );
        expect(res?.status).toBe(200);
        expect(await res!.json()).toEqual({
            ok: true,
            states: { "7": "open", "8": "closed" },
        });
        expect(state.githubCalls).toBe(2);
        expect(state.adminAuths).toBe(1);
        expect(state.patches.map((patch) => patch.auth)).toEqual([
            "admin-token",
            "admin-token",
        ]);
        const bodies = new Map(
            state.patches.map((patch) => [patch.id, patch.body]),
        );
        expect(bodies.get(issueReportId(1))).toMatchObject({
            issue_state: "open",
        });
        expect(bodies.get(issueReportId(2))).toMatchObject({
            issue_state: "closed",
        });
        expect(typeof bodies.get(issueReportId(2))?.issue_state_checked).toBe(
            "string",
        );
    });

    test("never asks GitHub again once an issue is persisted as closed", async () => {
        const { state, handler } = issueStatePb({
            rows: [syncedReport(1, 8, { issue_state: "closed" })],
            github: () => json({ state: "open" }),
        });
        const { service } = setup(handler);

        const res = await service(issueStateRequest([issueReportId(1)]));
        expect(res?.status).toBe(200);
        expect(await res!.json()).toEqual({
            ok: true,
            states: { "8": "closed" },
        });
        expect(state.githubCalls).toBe(0);
        expect(state.patches).toHaveLength(0);
    });

    test("keeps the persisted state when GitHub cannot resolve an issue", async () => {
        const { state, handler } = issueStatePb({
            rows: [syncedReport(1, 7)],
            github: () => json({ message: "boom" }, 500),
        });
        const { service } = setup(handler);

        const res = await service(issueStateRequest([issueReportId(1)]));
        expect(res?.status).toBe(200);
        expect(await res!.json()).toEqual({ ok: true, states: {} });
        expect(state.githubCalls).toBe(1);
        // Nothing confirmed means nothing written: the last badge survives.
        expect(state.patches).toHaveLength(0);
    });

    test("skips unreadable, unsynced and invalid reports", async () => {
        const { state, handler } = issueStatePb({
            rows: [
                syncedReport(2, 9, { status: "stored" }),
                syncedReport(3, 10, { issue_number: 0 }),
            ],
        });
        const { service } = setup(handler);

        // 1 is another owner's row (PB answers 404); "short" is not an id.
        const res = await service(
            issueStateRequest([
                issueReportId(1),
                issueReportId(2),
                issueReportId(3),
                "short",
                issueReportId(2),
            ]),
        );
        expect(res?.status).toBe(200);
        expect(await res!.json()).toEqual({ ok: true, states: {} });
        expect(state.githubCalls).toBe(0);
        expect(state.patches).toHaveLength(0);
    });

    test("falls back to the caller token when the admin login fails", async () => {
        const { state, handler } = issueStatePb({
            rows: [syncedReport(1, 7)],
            adminStatus: 401,
        });
        const { service } = setup(handler, {
            pbAdminEmail: "admin@test",
            pbAdminPassword: "pw",
        });

        const res = await service(issueStateRequest([issueReportId(1)]));
        expect(res?.status).toBe(200);
        expect(await res!.json()).toEqual({
            ok: true,
            states: { "7": "open" },
        });
        expect(state.adminAuths).toBe(1);
        expect(state.patches.map((patch) => patch.auth)).toEqual(["pb-token"]);
    });

    test("still answers the state when the caller cannot persist the row", async () => {
        const { state, handler } = issueStatePb({
            rows: [syncedReport(1, 7)],
            patchStatus: 403,
        });
        const { service } = setup(handler);

        const res = await service(issueStateRequest([issueReportId(1)]));
        expect(res?.status).toBe(200);
        expect(await res!.json()).toEqual({
            ok: true,
            states: { "7": "open" },
        });
        // No admin configured: the shared suggestion is read but not written.
        expect(state.patches.map((patch) => patch.auth)).toEqual(["pb-token"]);
    });

    test("caches each issue state for a minute", async () => {
        let clock = 1_000;
        const { state, handler } = issueStatePb({
            rows: [syncedReport(1, 7)],
            github: () => json({ state: "open" }),
        });
        const { service } = setup(handler, { now: () => clock });

        expect(
            (await service(issueStateRequest([issueReportId(1)])))?.status,
        ).toBe(200);
        expect(
            (await service(issueStateRequest([issueReportId(1)])))?.status,
        ).toBe(200);
        expect(state.githubCalls).toBe(1);

        clock += 60_001;
        expect(
            (await service(issueStateRequest([issueReportId(1)])))?.status,
        ).toBe(200);
        expect(state.githubCalls).toBe(2);
    });

    test("requires auth and stays quiet when GitHub is unconfigured", async () => {
        const { service, calls } = setup((url) => json({}, 404));
        expect(
            (await service(issueStateRequest([issueReportId(1)], null)))
                ?.status,
        ).toBe(401);
        expect(calls).toHaveLength(0);

        const unconfigured = setup((url) => json({}, 404), {
            githubToken: "",
        });
        const res = await unconfigured.service(
            issueStateRequest([issueReportId(1)]),
        );
        expect(res?.status).toBe(200);
        expect(await res!.json()).toEqual({
            ok: true,
            states: {},
            reason: "github_not_configured",
        });
        expect(
            unconfigured.calls.some((call) =>
                call.url.pathname.startsWith("/repos/"),
            ),
        ).toBe(false);
    });

    test("omits issues GitHub cannot resolve instead of failing the list", async () => {
        const { state, handler } = issueStatePb({
            rows: [syncedReport(1, 7), syncedReport(2, 8), syncedReport(3, 9)],
            github: (number) => {
                if (number === 7) return json({ message: "boom" }, 500);
                if (number === 8) return json({ state: "x" });
                return json({ state: "closed" });
            },
        });
        const { service } = setup(handler);

        const res = await service(
            issueStateRequest([
                issueReportId(1),
                issueReportId(2),
                issueReportId(3),
            ]),
        );
        expect(res?.status).toBe(200);
        expect(await res!.json()).toEqual({
            ok: true,
            states: { "9": "closed" },
        });
        expect(state.githubCalls).toBe(3);
        expect(state.patches.map((patch) => patch.id)).toEqual([
            issueReportId(3),
        ]);
    });

    test("caps one request at 50 reports", async () => {
        const rows = Array.from({ length: 55 }, (_, index) =>
            syncedReport(index + 1, index + 1),
        );
        const { state, handler } = issueStatePb({ rows });
        const { service } = setup(handler);

        const res = await service(issueStateRequest(rows.map((row) => row.id)));
        expect(res?.status).toBe(200);
        const body = (await res!.json()) as {
            states: Record<string, string>;
        };
        expect(Object.keys(body.states)).toHaveLength(50);
        expect(state.githubCalls).toBe(50);
    });

    test("rejects a malformed body", async () => {
        const { service } = setup((url) => json({}, 404));
        const res = await service(
            new Request(`http://supervisor${FEEDBACK_ISSUE_STATE_PATH}`, {
                method: "POST",
                headers: {
                    Authorization: "pb-token",
                    "content-type": "application/json",
                },
                body: JSON.stringify({ reportIds: issueReportId(1) }),
            }),
        );
        expect(res?.status).toBe(400);
    });
});

describe("feedback upload service", () => {
    test("requires a PocketBase token", async () => {
        const { service, calls } = setup(githubUploads({}));
        const res = await service(uploadRequest([{ name: "a.txt" }], null));
        expect(res?.status).toBe(401);
        expect(calls).toHaveLength(0);
    });

    test("answers 503 when GitHub is not configured", async () => {
        const { service, calls } = setup(githubUploads({}), {
            githubToken: "",
        });
        const res = await service(uploadRequest([{ name: "a.txt" }]));
        expect(res?.status).toBe(503);
        const body = (await res!.json()) as {
            ok: boolean;
            reason: string;
            error: string;
        };
        expect(body.ok).toBe(false);
        expect(body.reason).toBe("github_not_configured");
        expect(body.error).toContain("GITHUB_TOKEN");
        // Only auth-refresh happened; no GitHub call.
        expect(
            calls.some((call) => call.url.pathname.startsWith("/repos/")),
        ).toBe(false);
    });

    test("creates the release once and uploads every file", async () => {
        const assets: AssetCall[] = [];
        let releasePosts = 0;
        const { service, calls } = setup(
            githubUploads({
                onAsset: (call) => assets.push(call),
                onCreateRelease: () => {
                    releasePosts += 1;
                },
            }),
        );

        const res = await service(
            uploadRequest([
                { name: "截图 2026.png", type: "image/png", data: "png-bytes" },
                { name: "log.txt", type: "text/plain", data: "log-bytes" },
            ]),
        );
        expect(res?.status).toBe(200);
        const body = (await res!.json()) as {
            ok: boolean;
            attachments: Array<{
                name: string;
                url: string;
                size: number;
                type?: string;
            }>;
        };
        expect(body.ok).toBe(true);
        expect(body.attachments).toHaveLength(2);
        expect(body.attachments[0]).toEqual({
            name: "截图 2026.png",
            url: expect.stringContaining(
                "https://github.com/owner/repo/releases/download/feedback-assets/",
            ),
            size: 9,
            type: "image/png",
        });
        expect(body.attachments[1]).toEqual({
            name: "log.txt",
            url: expect.stringContaining(
                "https://github.com/owner/repo/releases/download/feedback-assets/",
            ),
            size: 9,
            // Bun appends a charset to a text File's type.
            type: expect.stringContaining("text/plain"),
        });

        // Release GET missed, then POST created it exactly once.
        expect(
            calls.filter(
                (call) =>
                    call.url.pathname ===
                    "/repos/owner/repo/releases/tags/feedback-assets",
            ),
        ).toHaveLength(1);
        const createCall = calls.find(
            (call) =>
                call.url.pathname === "/repos/owner/repo/releases" &&
                call.init?.method === "POST",
        );
        expect(releasePosts).toBe(1);
        expect(JSON.parse(String(createCall?.init?.body))).toMatchObject({
            tag_name: "feedback-assets",
            prerelease: true,
        });

        expect(assets).toHaveLength(2);
        const headers = assets[0].init?.headers as Record<string, string>;
        expect(headers.Authorization).toBe("Bearer github-token");
        expect(headers["Content-Type"]).toBe("image/png");
        expect(headers["User-Agent"]).toBe("mimi-base-feedback");
        expect(assets[0].url.origin).toBe("https://uploads.github.test");
        expect(assets[0].url.pathname).toBe(
            "/repos/owner/repo/releases/1/assets",
        );
        expect(assets[0].url.searchParams.get("name")).toMatch(
            /^[a-z0-9]+-[a-z0-9]+-2026\.png$/,
        );
        expect(assets[1].url.searchParams.get("name")).not.toBe(
            assets[0].url.searchParams.get("name"),
        );

        // A second submission reuses the cached release id.
        const again = await service(uploadRequest([{ name: "b.txt" }]));
        expect(again?.status).toBe(200);
        expect(releasePosts).toBe(1);
        expect(assets).toHaveLength(3);
        expect(
            calls.filter(
                (call) =>
                    call.url.pathname ===
                    "/repos/owner/repo/releases/tags/feedback-assets",
            ),
        ).toHaveLength(1);
    });

    test("reuses an existing feedback-assets release", async () => {
        const assets: AssetCall[] = [];
        const { service, calls } = setup(
            githubUploads({
                releaseFound: true,
                releaseId: 7,
                onAsset: (call) => assets.push(call),
            }),
        );
        const res = await service(uploadRequest([{ name: "a.txt" }]));
        expect(res?.status).toBe(200);
        expect(
            calls.some(
                (call) =>
                    call.url.pathname === "/repos/owner/repo/releases" &&
                    call.init?.method === "POST",
            ),
        ).toBe(false);
        expect(assets[0]?.url.pathname).toBe(
            "/repos/owner/repo/releases/7/assets",
        );
    });

    test("rejects too many or oversized files before uploading", async () => {
        const { service, calls } = setup(githubUploads({}));
        const tooMany = await service(
            uploadRequest([
                { name: "a.txt" },
                { name: "b.txt" },
                { name: "c.txt" },
                { name: "d.txt" },
            ]),
        );
        expect(tooMany?.status).toBe(400);
        expect(
            calls.some((call) => call.url.pathname.startsWith("/repos/")),
        ).toBe(false);

        const oversized = await service(
            uploadRequest([
                {
                    name: "big.bin",
                    type: "application/octet-stream",
                    data: new Uint8Array(10 * 1024 * 1024 + 1),
                },
            ]),
        );
        expect(oversized?.status).toBe(413);
        expect(
            calls.some((call) => call.url.pathname.startsWith("/repos/")),
        ).toBe(false);
    });

    test("fails the whole upload when GitHub rejects an asset", async () => {
        const { service } = setup(githubUploads({ assetStatus: 500 }));
        const res = await service(uploadRequest([{ name: "a.txt" }]));
        expect(res?.status).toBe(502);
        const body = (await res!.json()) as {
            ok: boolean;
            reason: string;
            error: string;
        };
        expect(body.ok).toBe(false);
        expect(body.reason).toBe("github_failed");
        expect(body.error).toContain("HTTP 500");
    });

    test("only accepts POST on the upload path", async () => {
        const { service } = setup(githubUploads({}));
        const res = await service(
            new Request(`http://supervisor${FEEDBACK_UPLOAD_PATH}`, {
                method: "GET",
            }),
        );
        expect(res?.status).toBe(405);
    });
});
