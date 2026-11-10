import { describe, expect, test } from "bun:test";

import { createAiRelay } from "./ai-relay";
import {
    AI_TOOLS_MEMORY_PATH,
    type AiToolsDeps,
    createAiToolsService,
    dayRangeUtc,
    htmlToText,
    isPrivateIp,
} from "./ai-tools";

const PB_BASE = "http://127.0.0.1:8090";

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function pbFetch(
    handler: (url: URL, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname === "/api/collections/users/auth-refresh") {
            return json({ record: { id: "user-1" } });
        }
        return handler(url, init);
    }) as typeof fetch;
}

function service(
    handler: (url: URL, init?: RequestInit) => Response | Promise<Response>,
    overrides: Partial<AiToolsDeps> = {},
) {
    return createAiToolsService({
        pbBaseUrl: PB_BASE,
        fetch: pbFetch(handler),
        ...overrides,
    });
}

describe("isPrivateIp", () => {
    test("blocks loopback, private and reserved IPv4", () => {
        for (const ip of [
            "127.0.0.1",
            "10.1.2.3",
            "172.16.0.1",
            "172.31.250.5",
            "192.168.1.1",
            "169.254.1.1",
            "0.0.0.0",
            "100.64.0.1",
            "224.0.0.1",
            "249.1.1.1",
            "not-an-ip",
            "999.1.1.1",
        ]) {
            expect(isPrivateIp(ip)).toBe(true);
        }
    });

    test("allows public IPv4", () => {
        for (const ip of [
            "8.8.8.8",
            "1.1.1.1",
            "93.184.216.34",
            "172.32.0.1",
        ]) {
            expect(isPrivateIp(ip)).toBe(false);
        }
    });

    test("blocks private/reserved IPv6", () => {
        for (const ip of [
            "::1",
            "::",
            "fd00::1",
            "fe80::1",
            "ff02::1",
            "::ffff:127.0.0.1",
        ]) {
            expect(isPrivateIp(ip)).toBe(true);
        }
    });

    test("allows public IPv6", () => {
        expect(isPrivateIp("2606:4700::1111")).toBe(false);
    });
});

describe("dayRangeUtc", () => {
    test("shifts local midnight into UTC", () => {
        // UTC+8 (tz = -480): local 2026-11-01 00:00 is 2026-10-31 16:00 UTC.
        const { startUtcMs } = dayRangeUtc("2026-11-01", "2026-11-07", -480);
        expect(new Date(startUtcMs).toISOString()).toBe(
            "2026-10-31T16:00:00.000Z",
        );
    });
});

describe("htmlToText", () => {
    test("extracts title, drops scripts/styles, keeps line breaks", () => {
        const { title, text } = htmlToText(
            `<html><head><title>今天 &amp; 明天</title></head>
             <body><script>evil()</script>
             <style>.x{}</style>
             <h1>标题</h1><p>第一段</p><br><p>第二段</p></body></html>`,
        );
        expect(title).toBe("今天 & 明天");
        expect(text).toContain("标题");
        expect(text).toContain("第一段");
        expect(text).toContain("第二段");
        expect(text).not.toContain("evil()");
        expect(text).not.toContain(".x{}");
    });

    test("decodes numeric entities", () => {
        expect(htmlToText("<p>&#x4eca;&#26085;</p>").text).toContain("今日");
    });
});

describe("ai tools service", () => {
    const call = (body: unknown) => ({
        pathname: AI_TOOLS_MEMORY_PATH,
        body: body as Record<string, unknown>,
        uid: "user-1",
        token: "pb-token",
    });

    test("save creates a memory owned by the caller", async () => {
        let posted: unknown;
        const tools = service((url, init) => {
            if (
                url.pathname.endsWith("/chat_memories/records") &&
                init?.method === "GET"
            ) {
                return json({ totalItems: 3 });
            }
            posted = JSON.parse(String(init?.body));
            return json({ id: "abc123" }, 200);
        });
        const res = await tools(
            call({ action: "save", content: "  不吃香菜  " }),
        );
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            ok: true,
            saved: true,
            id: "abc123",
            content: "不吃香菜",
        });
        expect(posted).toEqual({ owner: "user-1", content: "不吃香菜" });
    });

    test("save refuses empty content and the 100th memory", async () => {
        const tools = service((url, init) =>
            init?.method === "GET"
                ? json({ totalItems: 100 })
                : json({ id: "x" }),
        );
        expect(
            (await tools(call({ action: "save", content: "" }))).body,
        ).toEqual({
            ok: false,
            error: "要记的内容是空的",
        });
        expect(
            (await tools(call({ action: "save", content: "long" }))).body,
        ).toEqual({ ok: false, error: "记忆已经够多了，先删掉一些再记" });
    });

    test("delete reports missing rows as a tool result", async () => {
        const tools = service(() => json({ message: "missing" }, 404));
        const res = await tools(call({ action: "delete", id: "abc" }));
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: false, error: "这条记忆不存在" });
    });

    test("delete rejects malformed ids before touching PB", async () => {
        let called = false;
        const tools = service(() => {
            called = true;
            return json({});
        });
        await tools(call({ action: "delete", id: "../etc" }));
        expect(called).toBe(false);
    });

    test("list scopes by owner", async () => {
        let filter = "";
        const tools = service((url) => {
            filter = url.searchParams.get("filter") ?? "";
            return json({
                items: [
                    {
                        id: "m1",
                        content: "早睡",
                        created: "2026-11-07 00:00:00.000Z",
                    },
                ],
            });
        });
        const res = await tools(call({ action: "list" }));
        expect(filter).toBe('(owner = "user-1")');
        expect(res.body).toEqual({
            ok: true,
            items: [
                {
                    id: "m1",
                    content: "早睡",
                    created: "2026-11-07 00:00:00.000Z",
                },
            ],
        });
    });

    test("expenses aggregate totals by category over the shared ledger", async () => {
        let filter = "";
        let expand = "";
        const tools = service((url) => {
            filter = url.searchParams.get("filter") ?? "";
            expand = url.searchParams.get("expand") ?? "";
            return json({
                items: [
                    {
                        id: "a",
                        item_name: "午饭",
                        price: 20,
                        category: "food",
                        created: "2026-11-02 01:00:00.000Z",
                        user_id: "user-1",
                        expand: {
                            user_id: { user_name: "小红", tou_xiang: "h1.png" },
                        },
                    },
                    {
                        id: "b",
                        item_name: "奶茶",
                        price: 15.5,
                        category: "",
                        created: "2026-11-03 01:00:00.000Z",
                        user_id: "user-2",
                        expand: {
                            user_id: { user_name: "小黄", tou_xiang: "h2.png" },
                        },
                    },
                    {
                        id: "c",
                        item_name: "电影票",
                        price: 45,
                        category: "fun",
                        created: "2026-11-04 01:00:00.000Z",
                        user_id: "user-2",
                        // The built-in auth `name` is only a fallback.
                        expand: { user_id: { name: "小黄" } },
                    },
                ],
            });
        });
        const res = await tools({
            pathname: "/api/ai/tools/expenses",
            body: { from: "2026-11-01", to: "2026-11-07", tz: -480 },
            uid: "user-1",
            token: "pb-token",
        });
        expect(filter).toContain('created >= "2026-10-31 16:00:00.000Z"');
        expect(filter).toContain('created <= "2026-11-07 15:59:59.999Z"');
        expect(expand).toBe("user_id");
        expect(res.body).toMatchObject({
            ok: true,
            total: 80.5,
            byCategory: { food: 20, other: 15.5, fun: 45 },
            count: 3,
            people: [
                {
                    id: "user-2",
                    name: "小黄",
                    avatar: "h2.png",
                    mine: false,
                    total: 60.5,
                    count: 2,
                },
                {
                    id: "user-1",
                    name: "小红",
                    avatar: "h1.png",
                    mine: true,
                    total: 20,
                    count: 1,
                },
            ],
            items: [
                { id: "a", by: "小红", mine: true },
                { id: "b", by: "小黄", mine: false },
                { id: "c", by: "小黄", mine: false },
            ],
        });
    });

    test("expenses fall back to 我/对方 when a profile name is missing", async () => {
        const tools = service(() =>
            json({
                items: [
                    {
                        id: "a",
                        item_name: "午饭",
                        price: 20,
                        category: "food",
                        created: "2026-11-02 01:00:00.000Z",
                        user_id: "user-1",
                    },
                    {
                        id: "b",
                        item_name: "奶茶",
                        price: 10,
                        category: "",
                        created: "2026-11-03 01:00:00.000Z",
                        user_id: "user-2",
                        expand: { user_id: { user_name: "  " } },
                    },
                ],
            }),
        );
        const res = await tools({
            pathname: "/api/ai/tools/expenses",
            body: { tz: -480 },
            uid: "user-1",
            token: "pb-token",
        });
        expect(res.body).toMatchObject({
            ok: true,
            items: [
                { by: "我", mine: true },
                { by: "对方", mine: false },
            ],
            people: [
                { name: "我", mine: true, total: 20, count: 1 },
                { name: "对方", mine: false, total: 10, count: 1 },
            ],
        });
    });

    test("posts strip filter-breaking characters from the query", async () => {
        let filter = "";
        const tools = service((url) => {
            filter = url.searchParams.get("filter") ?? "";
            return json({ items: [] });
        });
        await tools({
            pathname: "/api/ai/tools/posts",
            body: { query: '上海" AND 1=1' },
            uid: "user-1",
            token: "pb-token",
        });
        expect(filter).toBe('(text ~ "上海 AND 1=1")');
    });

    test("posts name the author of each row", async () => {
        let expand = "";
        const tools = service((url) => {
            expand = url.searchParams.get("expand") ?? "";
            return json({
                items: [
                    {
                        id: "p1",
                        text: "今天去了海边",
                        created: "2026-11-01 10:00:00.000Z",
                        images: ["a.jpg"],
                        like_count: 3,
                        comment_count: 2,
                        author_id: "user-2",
                        expand: {
                            author_id: {
                                id: "user-2",
                                user_name: "小黄",
                                tou_xiang: "h2.png",
                            },
                        },
                    },
                    {
                        id: "p2",
                        text: "我来发一条",
                        created: "2026-11-02 10:00:00.000Z",
                        like_count: 0,
                        comment_count: 0,
                        author_id: "user-1",
                    },
                ],
            });
        });
        const res = await tools({
            pathname: "/api/ai/tools/posts",
            body: {},
            uid: "user-1",
            token: "pb-token",
        });
        expect(expand).toBe("author_id");
        expect(res.body).toMatchObject({
            ok: true,
            count: 2,
            items: [
                {
                    id: "p1",
                    by: "小黄",
                    mine: false,
                    comments: 2,
                    authorId: "user-2",
                    avatar: "h2.png",
                },
                {
                    id: "p2",
                    by: "我",
                    mine: true,
                    comments: 0,
                    authorId: "user-1",
                    avatar: "",
                },
            ],
        });
    });

    test("comments return recent rows with author, post and reply context", async () => {
        let filter = "";
        let expand = "";
        let sort = "";
        let perPage = "";
        const tools = service((url) => {
            filter = url.searchParams.get("filter") ?? "";
            expand = url.searchParams.get("expand") ?? "";
            sort = url.searchParams.get("sort") ?? "";
            perPage = url.searchParams.get("perPage") ?? "";
            return json({
                items: [
                    {
                        id: "c1",
                        text: "好呀，我五点半下班。",
                        created: "2026-11-09 03:08:49.526Z",
                        parent_id: "c0",
                        post_id: "p1",
                        author_id: "user-1",
                        expand: {
                            author_id: {
                                id: "user-1",
                                user_name: "小海",
                                tou_xiang: "h1.png",
                            },
                            post_id: {
                                id: "p1",
                                text: "新开的那家火锅店有人去过吗？",
                            },
                            parent_id: {
                                author_id: "user-2",
                                expand: {
                                    author_id: { user_name: "小满" },
                                },
                            },
                        },
                    },
                    {
                        id: "c2",
                        text: "照片呢？别只发文字。",
                        created: "2026-11-09 03:08:49.520Z",
                        post_id: "p1",
                        author_id: "user-2",
                        expand: {
                            author_id: { user_name: "小满" },
                        },
                    },
                ],
            });
        });
        const res = await tools({
            pathname: "/api/ai/tools/comments",
            body: {
                post_id: "p1",
                query: "火锅",
                author: "小满",
                limit: 5,
            },
            uid: "user-1",
            token: "pb-token",
        });
        expect(sort).toBe("-created");
        expect(perPage).toBe("5");
        expect(expand).toBe("author_id,post_id,parent_id.author_id");
        expect(filter).toBe(
            '(post_id = "p1" && text ~ "火锅" && author_id.user_name ~ "小满")',
        );
        expect(res.body).toEqual({
            ok: true,
            postId: "p1",
            query: "火锅",
            author: "小满",
            limit: 5,
            count: 2,
            truncated: false,
            items: [
                {
                    id: "c1",
                    text: "好呀，我五点半下班。",
                    created: "2026-11-09 03:08:49.526Z",
                    images: 0,
                    parentId: "c0",
                    replyTo: "小满",
                    postId: "p1",
                    postText: "新开的那家火锅店有人去过吗？",
                    authorId: "user-1",
                    avatar: "h1.png",
                    by: "小海",
                    mine: true,
                },
                {
                    id: "c2",
                    text: "照片呢？别只发文字。",
                    created: "2026-11-09 03:08:49.520Z",
                    images: 0,
                    parentId: "",
                    replyTo: "",
                    postId: "p1",
                    postText: "",
                    authorId: "user-2",
                    avatar: "",
                    by: "小满",
                    mine: false,
                },
            ],
        });
    });

    test("comments accept a record id as the author filter", async () => {
        let filter = "";
        const tools = service((url) => {
            filter = url.searchParams.get("filter") ?? "";
            return json({ items: [] });
        });
        await tools({
            pathname: "/api/ai/tools/comments",
            body: { author: "u2abc123xyz4567" },
            uid: "user-1",
            token: "pb-token",
        });
        expect(filter).toBe('(author_id = "u2abc123xyz4567")');
    });

    test("comments strip filter-breaking characters and clamp the limit", async () => {
        let filter = "";
        let perPage = "";
        const tools = service((url) => {
            filter = url.searchParams.get("filter") ?? "";
            perPage = url.searchParams.get("perPage") ?? "";
            return json({ items: [] });
        });
        await tools({
            pathname: "/api/ai/tools/comments",
            body: { query: '他说"好" AND 1=1', limit: 999 },
            uid: "user-1",
            token: "pb-token",
        });
        expect(filter).toBe('(text ~ "他说好 AND 1=1")');
        expect(perPage).toBe("60");
        await tools({
            pathname: "/api/ai/tools/comments",
            body: { limit: 0 },
            uid: "user-1",
            token: "pb-token",
        });
        expect(perPage).toBe("20");
    });

    test("comments flag truncation at the requested limit", async () => {
        const items = Array.from({ length: 3 }, (_, i) => ({
            id: `c${i}`,
            text: `评论 ${i}`,
            created: "2026-11-09 03:00:00.000Z",
            author_id: "user-1",
        }));
        const tools = service(() => json({ items }));
        const res = await tools({
            pathname: "/api/ai/tools/comments",
            body: { limit: 3 },
            uid: "user-1",
            token: "pb-token",
        });
        expect(res.body).toMatchObject({
            ok: true,
            count: 3,
            truncated: true,
        });
    });

    test("comments reject malformed post ids before touching PB", async () => {
        let called = false;
        const tools = service(() => {
            called = true;
            return json({ items: [] });
        });
        const bad = await tools({
            pathname: "/api/ai/tools/comments",
            body: { post_id: "../etc/passwd" },
            uid: "user-1",
            token: "pb-token",
        });
        expect(bad.body).toEqual({
            ok: false,
            error: "post_id 不是有效的动态记录 id",
        });
        const wrongType = await tools({
            pathname: "/api/ai/tools/comments",
            body: { post_id: 123 },
            uid: "user-1",
            token: "pb-token",
        });
        expect(wrongType.body).toEqual({
            ok: false,
            error: "post_id 应该是动态记录 id",
        });
        expect(called).toBe(false);
    });

    test("comments turn PB failures into a tool result", async () => {
        const tools = service(() => json({ message: "boom" }, 500));
        const res = await tools({
            pathname: "/api/ai/tools/comments",
            body: {},
            uid: "user-1",
            token: "pb-token",
        });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: false, error: "读不了评论" });
    });

    test("read_url refuses private addresses without fetching", async () => {
        let fetched = 0;
        const tools = service(() => {
            fetched += 1;
            return json({});
        });
        for (const url of [
            "http://127.0.0.1:8090/superuser",
            "http://10.0.0.1/internal",
            "http://172.16.5.4/",
            "http://192.168.1.33/router",
            "http://[::1]/",
            "ftp://example.com/file",
        ]) {
            const res = await tools({
                pathname: "/api/ai/tools/url",
                body: { url },
                uid: "user-1",
                token: "pb-token",
            });
            expect(res.body).toMatchObject({ ok: false });
        }
        expect(fetched).toBe(0);
    });

    test("read_url fetches public pages and strips html", async () => {
        const tools = service((url) => {
            if (url.hostname === "93.184.216.34") {
                return new Response(
                    "<html><title>天气</title><body><p>上海 22 度</p><script>x()</script></body></html>",
                    { headers: { "content-type": "text/html; charset=utf-8" } },
                );
            }
            return json({}, 404);
        });
        const res = await tools({
            pathname: "/api/ai/tools/url",
            body: { url: "http://93.184.216.34/weather" },
            uid: "user-1",
            token: "pb-token",
        });
        expect(res.body).toMatchObject({
            ok: true,
            title: "天气",
        });
        expect((res.body as { text: string }).text).toContain("上海 22 度");
        expect((res.body as { text: string }).text).not.toContain("x()");
    });

    test("read_url follows validated redirects only", async () => {
        const urls: string[] = [];
        const tools = service((url) => {
            urls.push(url.toString());
            if (url.pathname === "/start") {
                return new Response(null, {
                    status: 302,
                    headers: { location: "http://93.184.216.34/final" },
                });
            }
            return new Response("done", {
                headers: { "content-type": "text/plain" },
            });
        });
        const res = await tools({
            pathname: "/api/ai/tools/url",
            body: { url: "http://93.184.216.34/start" },
            uid: "user-1",
            token: "pb-token",
        });
        expect(res.body).toMatchObject({
            ok: true,
            url: "http://93.184.216.34/final",
        });
        expect(urls).toHaveLength(2);
    });

    test("read_url refuses redirects into private space", async () => {
        const tools = service((url) => {
            if (url.pathname === "/start") {
                return new Response(null, {
                    status: 302,
                    headers: { location: "http://127.0.0.1:9000/" },
                });
            }
            return new Response("nope", { status: 500 });
        });
        const res = await tools({
            pathname: "/api/ai/tools/url",
            body: { url: "http://93.184.216.34/start" },
            uid: "user-1",
            token: "pb-token",
        });
        expect(res.body).toEqual({ ok: false, error: "不能访问内网地址" });
    });
});

describe("tools relay wiring", () => {
    function relayHarness() {
        return createAiRelay({
            pbBaseUrl: PB_BASE,
            apiKey: "server-key",
            model: "deepseek-v4.1-flash",
            dailyLimit: 0,
            fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = new URL(String(input));
                if (url.pathname.endsWith("/auth-refresh")) {
                    const header =
                        init?.headers instanceof Headers
                            ? (init.headers.get("authorization") ?? "")
                            : String(
                                  (init?.headers as Record<string, string>)
                                      ?.Authorization ?? "",
                              );
                    return header === "good-token"
                        ? json({ record: { id: "user-1" } })
                        : json({}, 401);
                }
                return json({});
            }) as typeof fetch,
        });
    }

    test("requires a PocketBase token", async () => {
        const relay = relayHarness();
        const res = await relay(
            new Request("http://relay.test/api/ai/tools/memory", {
                method: "POST",
                body: JSON.stringify({ action: "list" }),
            }),
        );
        expect(res?.status).toBe(401);
    });

    test("rejects non-object bodies", async () => {
        const relay = relayHarness();
        const res = await relay(
            new Request("http://relay.test/api/ai/tools/memory", {
                method: "POST",
                headers: { Authorization: "good-token" },
                body: JSON.stringify([1, 2]),
            }),
        );
        expect(res?.status).toBe(400);
    });

    test("comments path is in the tools allowlist and needs auth", async () => {
        const relay = relayHarness();
        const anonymous = await relay(
            new Request("http://relay.test/api/ai/tools/comments", {
                method: "POST",
                body: JSON.stringify({ limit: 1 }),
            }),
        );
        expect(anonymous?.status).toBe(401);

        const authed = await relay(
            new Request("http://relay.test/api/ai/tools/comments", {
                method: "POST",
                headers: { Authorization: "good-token" },
                body: JSON.stringify({ limit: 1 }),
            }),
        );
        expect(authed?.status).toBe(200);
        expect(await authed?.json()).toMatchObject({
            ok: true,
            count: 0,
            items: [],
        });
    });

    test("comments share the 30/min data-tool rate limit", async () => {
        const relay = relayHarness();
        for (let i = 0; i < 30; i += 1) {
            const res = await relay(
                new Request("http://relay.test/api/ai/tools/comments", {
                    method: "POST",
                    headers: { Authorization: "good-token" },
                    body: JSON.stringify({ limit: 1 }),
                }),
            );
            expect(res?.status).toBe(200);
        }
        const limited = await relay(
            new Request("http://relay.test/api/ai/tools/comments", {
                method: "POST",
                headers: { Authorization: "good-token" },
                body: JSON.stringify({ limit: 1 }),
            }),
        );
        expect(limited?.status).toBe(429);
    });
});
