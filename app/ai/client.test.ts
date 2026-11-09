import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
    AiError,
    chatJSON,
    chatText,
    createSseParser,
    parseJson,
    parseRetryAfter,
    parseSseEvent,
    streamChat,
    type AiMessage,
} from "./client";
import type { AiSettings } from "./config";
import { setAiRelayBaseUrlProvider } from "./endpoint";
import { setAiAuthTokenProvider } from "./pb-token";
import { recordUsage } from "./usage";

const settings: AiSettings = {
    notify: false,
    dailyBudgetUsd: 0,
};

const messages: AiMessage[] = [{ role: "user", content: "你好" }];

function installStorage() {
    const store = new Map<string, string>();
    (globalThis as unknown as { window: unknown }).window = globalThis;
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            store.set(key, String(value));
        },
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
        key: (index: number) => [...store.keys()][index] ?? null,
        get length() {
            return store.size;
        },
    };
    return store;
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function chatBody(content: string) {
    return {
        choices: [{ message: { content } }],
        usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
        },
    };
}

const realFetch = globalThis.fetch;
type Handler = (url: string, init?: RequestInit) => Promise<Response>;
let handler: Handler;
let calls: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
    calls = [];
    installStorage();
    setAiRelayBaseUrlProvider(
        () => "https://mimi.example.com/api/ai/opencode/v1",
    );
    setAiAuthTokenProvider(() => "pb-token");
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return handler(String(url), init);
    }) as unknown as typeof fetch;
});

afterEach(() => {
    globalThis.fetch = realFetch;
});

describe("SSE 解码", () => {
    test("按 \\r\\n / \\r / \\n 切行并合并多行 data", () => {
        const parser = createSseParser();
        expect(
            parser.push('data: {"a":1}\r\ndata: {"b":2}\r\n\r\n: ping\r\n'),
        ).toEqual(['{"a":1}\n{"b":2}']);
    });

    test("跨 chunk 累积，空行才吐出事件", () => {
        const parser = createSseParser();
        expect(parser.push("data: hel")).toEqual([]);
        expect(parser.push("lo\n\n")).toEqual(["hello"]);
    });

    test("end() 把尾巴当最后一个事件", () => {
        const parser = createSseParser();
        expect(parser.push("data: tail")).toEqual([]);
        expect(parser.end()).toEqual(["tail"]);
    });

    test("[DONE]、错误载荷、usage、增量正文", () => {
        expect(parseSseEvent("[DONE]")).toEqual({ done: true });
        expect(() => parseSseEvent('{"error":{"message":"额度用完"}}')).toThrow(
            /额度用完/,
        );
        expect(parseSseEvent("bad json")).toEqual({ done: false });
        expect(
            parseSseEvent(
                '{"choices":[{"delta":{"content":"你"}}],"usage":{"total_tokens":3}}',
            ),
        ).toEqual({
            done: false,
            content: "你",
            usage: { total_tokens: 3 },
        });
    });
});

describe("parseJson", () => {
    test("对象、数组、markdown 代码块、混杂文本都能截出 JSON", () => {
        expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
        expect(parseJson("[1,2,3]")).toEqual([1, 2, 3]);
        expect(parseJson('前面一句 {"x":2} 后面一句')).toEqual({ x: 2 });
        expect(parseJson("完全不是 json")).toBeUndefined();
    });
});

describe("parseRetryAfter", () => {
    test("秒数 / 空 / 非法", () => {
        expect(parseRetryAfter("2")).toBe(2000);
        expect(parseRetryAfter("0")).toBe(0);
        expect(parseRetryAfter(null)).toBeUndefined();
        expect(parseRetryAfter(" nonsense ")).toBeUndefined();
    });
});

describe("chatText / streamChat", () => {
    test("只发 PB 令牌到 /ai 中转，不携带任何用户 Key", async () => {
        handler = async () => jsonResponse(chatBody("ok"));
        await chatText(settings, messages);

        expect(calls[0].url).toBe(
            "https://mimi.example.com/api/ai/opencode/v1/chat/completions",
        );
        const headers = new Headers(calls[0].init?.headers);
        expect(headers.get("authorization")).toBe("pb-token");
        expect(headers.has("x-opencode-key")).toBe(false);
        const body = JSON.parse(String(calls[0].init?.body)) as {
            model?: string;
        };
        expect(body.model).toBe("deepseek-v4.1-flash");
    });

    test("非流式返回正文并带上 usage 统计", async () => {
        handler = async () => jsonResponse(chatBody(" 写好了 "));
        const text = await chatText(settings, messages);
        expect(text).toBe("写好了");
        const usage = JSON.parse(
            (
                globalThis as unknown as { localStorage: Storage }
            ).localStorage.getItem("mimi:ai-usage:v1") ?? "{}",
        );
        expect(usage.tokens).toBe(15);
    });

    test("真正按 SSE 事件流逐段 yield，遇到 [DONE] 停止", async () => {
        handler = async () =>
            new Response(
                [
                    'data: {"choices":[{"delta":{"content":"你"}}]}',
                    "",
                    'data: {"choices":[{"delta":{"content":"好"}}]}',
                    "",
                    "data: [DONE]",
                    "",
                ].join("\n"),
                {
                    status: 200,
                    headers: { "content-type": "text/event-stream" },
                },
            );
        const chunks: string[] = [];
        for await (const chunk of streamChat(settings, messages)) {
            chunks.push(chunk);
        }
        expect(chunks.join("")).toBe("你好");
    });

    test("SSE 里的 error 载荷抛 AiError", async () => {
        handler = async () =>
            new Response('data: {"error":{"message":"服务端炸了"}}\n\n', {
                status: 200,
                headers: { "content-type": "text/event-stream" },
            });
        await expect(async () => {
            for await (const _ of streamChat(settings, messages)) {
                void _;
            }
        }).toThrow(AiError);
    });
});

describe("chatJSON", () => {
    test("默认请求 response_format:json_object 并用 zod 校验返回", async () => {
        handler = async (_url, init) => {
            const body = JSON.parse(String(init?.body ?? "{}"));
            expect(body.response_format).toEqual({ type: "json_object" });
            expect(body.max_tokens).toBeGreaterThan(0);
            return jsonResponse(chatBody('{"items":[1,2]}'));
        };
        await expect(chatJSON(settings, messages)).resolves.toEqual({
            items: [1, 2],
        });
    });

    test("传了 zod schema 时按 schema 强校验", async () => {
        const { z } = await import("zod");
        handler = async () => jsonResponse(chatBody('{"score":90}'));
        const schema = z.object({ score: z.number() });
        await expect(
            chatJSON(settings, messages, undefined, { schema }),
        ).resolves.toEqual({ score: 90 });
    });

    test("顶层是标量 / 非法 JSON 时给清晰的 AiError", async () => {
        let attempt = 0;
        handler = async () =>
            jsonResponse(
                chatBody(attempt++ === 0 ? "就是一个字符串" : "还是字符串"),
            );
        await expect(chatJSON(settings, messages)).rejects.toMatchObject({
            name: "AiError",
        });
    });

    test("服务商不认 response_format 时退回普通模式", async () => {
        let attempt = 0;
        handler = async (_url, init) => {
            const body = JSON.parse(String(init?.body ?? "{}"));
            if (attempt++ === 0) {
                expect(body.response_format).toBeDefined();
                return jsonResponse(
                    { error: { message: "response_format not supported" } },
                    400,
                );
            }
            expect(body.response_format).toBeUndefined();
            return jsonResponse(chatBody('{"ok":true}'));
        };
        await expect(chatJSON(settings, messages)).resolves.toEqual({
            ok: true,
        });
        expect(calls.length).toBe(2);
    });

    test("429 会退避重试（尊重 Retry-After: 0）", async () => {
        let attempt = 0;
        handler = async () => {
            if (attempt++ === 0) {
                return new Response('{"error":"rate limited"}', {
                    status: 429,
                    headers: { "retry-after": "0" },
                });
            }
            return jsonResponse(chatBody("ok"));
        };
        await expect(chatText(settings, messages)).resolves.toBe("ok");
        expect(calls.length).toBe(2);
    });
});

describe("每日预算上限", () => {
    test("超过预算时直接拒绝，连 fetch 都不发", async () => {
        recordUsage("deepseek-chat", {
            promptTokens: 1_000_000,
            completionTokens: 0,
            totalTokens: 1_000_000,
        });
        handler = async () => jsonResponse(chatBody("不该被调用"));
        await expect(
            chatText({ ...settings, dailyBudgetUsd: 0.01 }, messages),
        ).rejects.toMatchObject({ name: "AiError" });
        expect(calls.length).toBe(0);
    });
});
