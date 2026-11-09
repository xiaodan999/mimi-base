import { describe, expect, test } from "bun:test";

import {
    FEEDBACK_REPORT_PATH,
    buildIssueBody,
    buildIssueTitle,
    buildTranscript,
    cleanText,
    createFeedbackService,
    formatConsoleErrors,
    messageText,
    type FeedbackDeps,
    type FeedbackReport,
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
        screenshots: ["shot-one.webp", "shot-two.webp"],
        ...overrides,
    };
}

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
    test("includes description, context, screenshots and console errors", () => {
        const body = buildIssueBody({
            report: report(),
            now: new Date("2026-11-09T12:00:00.000Z"),
        });
        expect(body).toContain("打开首页后白屏");
        expect(body).toContain("`/home`");
        expect(body).toContain("0.0.1 (abc1234)");
        expect(body).toContain("2026-11-09T12:00:00.000Z");
        expect(body).toContain("Mozilla/5.0 (iPhone)");
        expect(body).toContain("shot-one.webp");
        expect(body).toContain("图片保存在 App 内的反馈记录里");
        expect(body).toContain(
            "TypeError: cannot read properties of undefined",
        );
        expect(body).toContain("控制台 / 页面错误");
        expect(body).toContain("关联 AI 对话：未附加");
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
                screenshots: ["idea-one.webp", "idea-two.webp"],
                console: [{ kind: "error", message: "feature console noise" }],
            }),
            now: new Date("2026-11-09T12:00:00.000Z"),
        });
        expect(body).toContain("想要什么：首页每天一句");
        expect(body).toContain("### 建议信息");
        expect(body).toContain("- 类型：功能建议");
        expect(body).toContain("照片：2 张");
        expect(body).toContain("idea-one.webp");
        expect(body).toContain("照片保存在 App 内的反馈记录里");
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
                    screenshots: ["idea-one.webp", "idea-two.webp"],
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
        expect(payload.body).toContain("照片：2 张");
        expect(payload.body).toContain("照片保存在 App 内的反馈记录里");
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

    test("rate-limits after five submissions per user", async () => {
        const { service, calls } = setup(pbHandler({}));
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const res = await service(submit());
            expect(res?.status).toBe(200);
        }
        const blocked = await service(submit());
        expect(blocked?.status).toBe(429);
        const body = (await blocked!.json()) as {
            error: string;
            retryAfter: number;
        };
        expect(body.error).toContain("太频繁");
        expect(body.retryAfter).toBe(3600);
        expect(
            calls.filter((call) => call.url.pathname.endsWith("/issues")),
        ).toHaveLength(5);
    });

    test("does not spend rate-limit quota on already-synced retries", async () => {
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

        // Six retries would exhaust a 5/hour window if they counted.
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
