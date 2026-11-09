import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { AI_FILES_PATH } from "./ai-files";
import {
    AI_CHAT_PATH,
    AI_HEALTH_PATH,
    createAiRelay,
    type AiRelayDeps,
} from "./ai-relay";
import { MAX_FILE_BYTES, PDF_NO_TEXT_LAYER_CODE } from "../lib/chat-files";

const PB_BASE = "http://127.0.0.1:8090";
const UPSTREAM = "https://opencode.ai/zen/go/v1/chat/completions";

type Call = { url: string; init?: RequestInit };

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function authHeader(init?: RequestInit): string {
    const headers = init?.headers;
    if (!headers) return "";
    if (headers instanceof Headers) {
        return headers.get("authorization") ?? "";
    }
    const record = headers as Record<string, string>;
    return record.Authorization ?? record.authorization ?? "";
}

function harness(overrides: Partial<AiRelayDeps> = {}) {
    const calls: Call[] = [];
    let authCalls = 0;
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url === `${PB_BASE}/api/collections/users/auth-refresh`) {
            authCalls += 1;
            return authHeader(init) === "good-token"
                ? json({ record: { id: "user-1" } })
                : json({ message: "invalid" }, 401);
        }
        return json({ choices: [{ message: { content: "ok" } }] });
    }) as typeof fetch;

    const relay = createAiRelay({
        pbBaseUrl: PB_BASE,
        apiKey: "server-key",
        model: "deepseek-v4.1-flash",
        dailyLimit: 0,
        fetch: fetchImpl,
        ...overrides,
    });
    return { relay, calls, authCalls: () => authCalls };
}

function request(path: string, init: RequestInit = {}): Request {
    return new Request(`http://relay.test${path}`, init);
}

function chatRequest(
    options: {
        token?: string;
        headers?: Record<string, string>;
        body?: unknown;
    } = {},
): Request {
    return request(AI_CHAT_PATH, {
        method: "POST",
        headers: {
            Authorization: options.token ?? "good-token",
            "Content-Type": "application/json",
            ...options.headers,
        },
        body: JSON.stringify(
            options.body ?? {
                messages: [{ role: "user", content: "你好" }],
                stream: true,
            },
        ),
    });
}

function upstreamCall(calls: Call[]): Call {
    const call = calls.find((item) => item.url === UPSTREAM);
    if (!call) throw new Error("upstream was not called");
    return call;
}

describe("routing", () => {
    test("non-/ai requests are left to the deploy dispatcher", async () => {
        const { relay } = harness();
        expect(await relay(request("/spa/publish"))).toBeNull();
        expect(await relay(request("/aix"))).toBeNull();
    });

    test("OPTIONS returns CORS preflight", async () => {
        const { relay } = harness();
        const res = await relay(request(AI_CHAT_PATH, { method: "OPTIONS" }));
        expect(res?.status).toBe(204);
        expect(res?.headers.get("access-control-allow-origin")).toBe("*");
        expect(res?.headers.get("access-control-allow-methods")).toContain(
            "POST",
        );
    });

    test("health reports key/model without auth", async () => {
        const { relay } = harness();
        const res = await relay(request(AI_HEALTH_PATH));
        expect(res?.status).toBe(200);
        expect(await res?.json()).toEqual({
            ok: true,
            keyConfigured: true,
            model: "deepseek-v4.1-flash",
        });
    });

    test("unknown /ai paths are 404", async () => {
        const { relay } = harness();
        const res = await relay(request("/api/ai/nope"));
        expect(res?.status).toBe(404);
    });
});

describe("auth", () => {
    test("missing token is 401 and never reaches upstream", async () => {
        const { relay, calls } = harness();
        const res = await relay(chatRequest({ token: "" }));
        expect(res?.status).toBe(401);
        expect(calls).toHaveLength(0);
    });

    test("invalid token is 401", async () => {
        const { relay, calls } = harness();
        const res = await relay(chatRequest({ token: "bad-token" }));
        expect(res?.status).toBe(401);
        expect(calls).toHaveLength(1); // auth-refresh only
    });

    test("valid tokens are cached briefly", async () => {
        const { relay, authCalls } = harness();
        expect((await relay(chatRequest()))?.status).toBe(200);
        expect((await relay(chatRequest()))?.status).toBe(200);
        expect(authCalls()).toBe(1);
    });
});

describe("request forwarding", () => {
    test("uses the server key and ignores a client-supplied key", async () => {
        const { relay, calls } = harness();
        const res = await relay(
            chatRequest({ headers: { "x-opencode-key": "sk-user" } }),
        );
        expect(res?.status).toBe(200);
        const upstream = upstreamCall(calls);
        expect(authHeader(upstream.init)).toBe("Bearer server-key");
    });

    test("forces the server model and clamps max_tokens", async () => {
        const { relay, calls } = harness();
        await relay(
            chatRequest({
                body: {
                    model: "gpt-4o",
                    max_tokens: 999_999,
                    messages: [{ role: "user", content: "hi" }],
                },
            }),
        );
        const body = JSON.parse(
            String(upstreamCall(calls).init?.body),
        ) as Record<string, unknown>;
        expect(body.model).toBe("deepseek-v4.1-flash");
        expect(body.max_tokens).toBe(8192);
    });

    test("missing server key is 503", async () => {
        const { relay, calls } = harness({ apiKey: "" });
        const res = await relay(chatRequest());
        expect(res?.status).toBe(503);
        expect(calls.some((call) => call.url === UPSTREAM)).toBe(false);
    });

    test("oversized bodies are 413", async () => {
        const { relay } = harness();
        const big = JSON.stringify({
            messages: [],
            padding: "x".repeat(16 * 1024 * 1024 + 1),
        });
        const res = await relay(
            request(AI_CHAT_PATH, {
                method: "POST",
                headers: {
                    Authorization: "good-token",
                    "Content-Type": "application/json",
                },
                body: big,
            }),
        );
        expect(res?.status).toBe(413);
    });

    test("upstream errors are sanitized", async () => {
        const fetchImpl = (async (input: RequestInfo | URL) => {
            if (String(input).endsWith("/auth-refresh")) {
                return json({ record: { id: "user-1" } });
            }
            return json({ error: { message: "secret upstream detail" } }, 500);
        }) as typeof fetch;
        const relay = createAiRelay({
            pbBaseUrl: PB_BASE,
            apiKey: "server-key",
            model: "deepseek-v4.1-flash",
            dailyLimit: 0,
            fetch: fetchImpl,
        });
        const res = await relay(chatRequest());
        expect(res?.status).toBe(502);
        const text = await res!.text();
        expect(text).not.toContain("secret upstream detail");
    });
});

describe("limits", () => {
    test("daily limit returns 429", async () => {
        const { relay } = harness({ dailyLimit: 1 });
        expect((await relay(chatRequest()))?.status).toBe(200);
        const res = await relay(chatRequest());
        expect(res?.status).toBe(429);
        expect(await res?.json()).toMatchObject({
            error: { message: expect.stringContaining("次数用完") },
        });
    });

    test("minute limit resets after the window", async () => {
        let time = 1_000_000;
        const { relay } = harness({ now: () => time });
        for (let i = 0; i < 20; i++) {
            expect((await relay(chatRequest()))?.status).toBe(200);
        }
        expect((await relay(chatRequest()))?.status).toBe(429);
        time += 60_001;
        expect((await relay(chatRequest()))?.status).toBe(200);
    });
});

describe("streaming", () => {
    test("passes SSE chunks through without buffering", async () => {
        const encoder = new TextEncoder();
        let emitSecond: (() => void) | null = null;
        let secondSent = false;

        const fetchImpl = (async (input: RequestInfo | URL) => {
            if (String(input).endsWith("/auth-refresh")) {
                return json({ record: { id: "user-1" } });
            }
            return new Response(
                new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(encoder.encode("data: one\n\n"));
                        emitSecond = () => {
                            secondSent = true;
                            controller.enqueue(encoder.encode("data: two\n\n"));
                            controller.enqueue(
                                encoder.encode("data: [DONE]\n\n"),
                            );
                            controller.close();
                        };
                    },
                }),
                {
                    headers: { "content-type": "text/event-stream" },
                },
            );
        }) as typeof fetch;

        const relay = createAiRelay({
            pbBaseUrl: PB_BASE,
            apiKey: "server-key",
            model: "deepseek-v4.1-flash",
            dailyLimit: 0,
            fetch: fetchImpl,
        });

        const res = await relay(chatRequest());
        expect(res?.status).toBe(200);
        expect(res?.headers.get("content-type")).toBe("text/event-stream");
        expect(res?.headers.get("x-accel-buffering")).toBe("no");

        const reader = res!.body!.getReader();
        const first = await reader.read();
        expect(new TextDecoder().decode(first.value)).toBe("data: one\n\n");
        expect(secondSent).toBe(false);

        emitSecond!();
        let rest = "";
        for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            rest += new TextDecoder().decode(chunk.value);
        }
        expect(rest).toContain("data: two");
        expect(rest).toContain("[DONE]");
    });
});

describe("attachments", () => {
    const fixtures = path.join(import.meta.dir, "__fixtures__/chat-files");

    function upload(
        options: {
            token?: string;
            name?: string;
            body?: BodyInit;
            headers?: Record<string, string>;
        } = {},
    ): Request {
        return request(AI_FILES_PATH, {
            method: "POST",
            headers: {
                Authorization: options.token ?? "good-token",
                "x-file-name": encodeURIComponent(options.name ?? "notes.md"),
                ...options.headers,
            },
            body: options.body ?? "# 标题",
        });
    }

    test("requires a PocketBase token", async () => {
        const { relay } = harness();
        const res = await relay(upload({ token: "bad-token" }));
        expect(res?.status).toBe(401);
    });

    test("reads a text file on the server", async () => {
        const { relay, calls } = harness();
        const res = await relay(upload({ name: "note.md", body: "你好" }));
        expect(res?.status).toBe(200);
        expect(await res!.json()).toMatchObject({
            ok: true,
            name: "note.md",
            kind: "text",
            content: "你好",
            truncated: false,
        });
        // Extraction never goes through the model upstream.
        expect(calls.some((call) => call.url === UPSTREAM)).toBe(false);
    });

    test("reads a Chinese PDF with the server CMaps", async () => {
        const { relay } = harness();
        const res = await relay(
            upload({
                name: "cjk-text.pdf",
                body: new Uint8Array(
                    readFileSync(path.join(fixtures, "cjk-text.pdf")),
                ),
            }),
        );
        expect(res?.status).toBe(200);
        const body = (await res!.json()) as { content?: string };
        expect(body.content).toContain("你好");
    });

    test("rejects unsupported file types", async () => {
        const { relay } = harness();
        const res = await relay(upload({ name: "photo.jpg", body: "x" }));
        expect(res?.status).toBe(400);
        expect(await res!.json()).toMatchObject({
            error: { message: "不支持这种文件类型" },
        });
    });

    test("rejects a declared oversized body before reading it", async () => {
        const { relay } = harness();
        const res = await relay(
            upload({
                headers: { "content-length": String(MAX_FILE_BYTES + 1) },
            }),
        );
        expect(res?.status).toBe(413);
    });
});

describe("stored attachments (JSON reads)", () => {
    const fixtures = path.join(import.meta.dir, "__fixtures__/chat-files");
    const RECORD_URL = `${PB_BASE}/api/collections/chat_attachments/records/att1`;
    const FILE_URL = `${PB_BASE}/api/files/chat_attachments/att1/contract.pdf`;

    /** Relay whose PocketBase serves one stored attachment record. */
    function storedHarness(
        overrides: {
            recordStatus?: number;
            /** Which fixture the stored file serves; default cjk-text.pdf. */
            fileFixture?: string;
        } = {},
    ) {
        const calls: Call[] = [];
        const fetchImpl = (async (
            input: RequestInfo | URL,
            init?: RequestInit,
        ) => {
            const url = String(input);
            calls.push({ url, init });
            if (url === `${PB_BASE}/api/collections/users/auth-refresh`) {
                return authHeader(init) === "good-token"
                    ? json({ record: { id: "user-1" } })
                    : json({ message: "invalid" }, 401);
            }
            if (url === RECORD_URL) {
                const status = overrides.recordStatus ?? 200;
                if (status !== 200) return json({}, status);
                return json({ name: "订货合同.pdf", file: "contract.pdf" });
            }
            if (url === `${PB_BASE}/api/files/token`) {
                return json({ token: "file-token" });
            }
            if (url.startsWith(FILE_URL)) {
                return new Response(
                    readFileSync(
                        path.join(
                            fixtures,
                            overrides.fileFixture ?? "cjk-text.pdf",
                        ),
                    ),
                    { status: 200 },
                );
            }
            return json({});
        }) as typeof fetch;
        const relay = createAiRelay({
            pbBaseUrl: PB_BASE,
            apiKey: "server-key",
            model: "deepseek-v4.1-flash",
            dailyLimit: 0,
            fetch: fetchImpl,
        });
        return { relay, calls };
    }

    function storedRead(body: Record<string, unknown>): Request {
        return request(AI_FILES_PATH, {
            method: "POST",
            headers: {
                Authorization: "good-token",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });
    }

    test("extracts the stored copy instead of taking raw bytes", async () => {
        const { relay, calls } = storedHarness();
        const res = await relay(storedRead({ attachmentId: "att1" }));
        expect(res?.status).toBe(200);
        const body = (await res!.json()) as { content?: string; ok?: boolean };
        expect(body.ok).toBe(true);
        expect(body.content).toContain("你好");
        // Record fetched with the caller's token (view rule scopes it); the
        // file comes through the file-token URL.
        const recordCall = calls.find((call) => call.url === RECORD_URL);
        expect(authHeader(recordCall?.init)).toBe("good-token");
        expect(calls.some((call) => call.url.includes("files/token"))).toBe(
            true,
        );
    });

    test("a missing record is 404 and readable", async () => {
        const { relay } = storedHarness({ recordStatus: 404 });
        const res = await relay(storedRead({ attachmentId: "att1" }));
        expect(res?.status).toBe(404);
        expect(await res!.json()).toMatchObject({
            error: { message: "找不到这个附件，可能已经被删了" },
        });
    });

    test("pages mode renders the requested pages", async () => {
        const { relay } = storedHarness();
        const res = await relay(
            storedRead({ attachmentId: "att1", pages: "1" }),
        );
        expect(res?.status).toBe(200);
        const body = (await res!.json()) as {
            pages?: number[];
            images?: string[];
        };
        expect(body.pages).toEqual([1]);
        expect(body.images?.[0]).toStartWith("data:image/jpeg;base64,");
    });

    test("a text-mode scan read fails with the retryable code", async () => {
        const { relay } = storedHarness({ fileFixture: "scan.pdf" });
        const res = await relay(storedRead({ attachmentId: "att1" }));
        expect(res?.status).toBe(400);
        expect(await res!.json()).toMatchObject({
            error: {
                message: expect.stringContaining("没有文字层"),
                code: PDF_NO_TEXT_LAYER_CODE,
            },
        });
    });

    test("a scan read with page images succeeds", async () => {
        const { relay } = storedHarness({ fileFixture: "scan.pdf" });
        const res = await relay(
            storedRead({ attachmentId: "att1", pageImageLimit: 10 }),
        );
        expect(res?.status).toBe(200);
        const body = (await res!.json()) as { images?: string[] };
        expect(body.images?.length).toBeGreaterThan(0);
        expect(body.images?.[0]).toStartWith("data:image/jpeg;base64,");
    });

    test("garbage bodies are rejected", async () => {
        const { relay } = storedHarness();
        const res = await relay(
            request(AI_FILES_PATH, {
                method: "POST",
                headers: {
                    Authorization: "good-token",
                    "Content-Type": "application/json",
                },
                body: "not-json",
            }),
        );
        expect(res?.status).toBe(400);
        const missing = await relay(
            storedRead({ attachmentId: "../etc/passwd" }),
        );
        expect(missing?.status).toBe(400);
    });
});
