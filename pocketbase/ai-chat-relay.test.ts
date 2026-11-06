import { describe, expect, test } from "bun:test";

import {
    AI_CHAT_COMPLETIONS_PATH,
    AI_CHAT_PATH,
    AI_MODELS_PATH,
    createAiRelay,
    type AiRelayDeps,
} from "./ai-relay";
import type { ChatModelInfo } from "./chat-models";

const PB_BASE = "http://127.0.0.1:8090";
const UPSTREAM = "https://opencode.ai/zen/go/v1/chat/completions";

const MODELS: ChatModelInfo[] = [
    {
        id: "vision-model",
        label: "Vision",
        vision: true,
        tools: true,
        reasoning: true,
        thinkingLevels: ["low", "high"],
        contextWindow: 200_000,
    },
    {
        id: "text-model",
        label: "Text",
        vision: false,
        tools: false,
        reasoning: false,
        thinkingLevels: [],
        contextWindow: 0,
    },
];

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
    if (headers instanceof Headers) return headers.get("authorization") ?? "";
    const record = headers as Record<string, string>;
    return record.Authorization ?? record.authorization ?? "";
}

function harness(overrides: Partial<AiRelayDeps> = {}) {
    const calls: Call[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url === `${PB_BASE}/api/collections/users/auth-refresh`) {
            return authHeader(init) === "good-token"
                ? json({ record: { id: "user-1" } })
                : json({ message: "invalid" }, 401);
        }
        return json({ choices: [{ message: { content: "ok" } }] });
    }) as typeof fetch;

    const relay = createAiRelay({
        pbBaseUrl: PB_BASE,
        apiKey: "server-key",
        model: "legacy-model",
        chatModels: MODELS,
        defaultChatModel: "text-model",
        dailyLimit: 0,
        fetch: fetchImpl,
        ...overrides,
    });
    return { relay, calls };
}

function request(path: string, init: RequestInit = {}): Request {
    return new Request(`http://relay.test${path}`, init);
}

function chatRequest(
    path: string,
    body: unknown,
    token = "good-token",
): Request {
    return request(path, {
        method: "POST",
        headers: {
            Authorization: token,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
}

function upstreamBody(calls: Call[]): Record<string, unknown> {
    const call = calls.find((item) => item.url === UPSTREAM);
    if (!call) throw new Error("upstream was not called");
    return JSON.parse(String(call.init?.body)) as Record<string, unknown>;
}

describe("chat model allowlist", () => {
    test("GET /ai/models requires auth and returns the allowlist", async () => {
        const { relay } = harness();
        expect((await relay(request(AI_MODELS_PATH)))?.status).toBe(401);

        const res = await relay(
            request(AI_MODELS_PATH, {
                headers: { Authorization: "good-token" },
            }),
        );
        expect(res?.status).toBe(200);
        expect(await res?.json()).toEqual({
            models: MODELS,
            defaultModel: "text-model",
            keyConfigured: true,
        });
    });

    test("chat honours an allowlisted model", async () => {
        const { relay, calls } = harness();
        const res = await relay(
            chatRequest(AI_CHAT_COMPLETIONS_PATH, {
                model: "vision-model",
                messages: [{ role: "user", content: "hi" }],
                stream: true,
            }),
        );
        expect(res?.status).toBe(200);
        expect(upstreamBody(calls).model).toBe("vision-model");
    });

    test("chat falls back to the default when model is omitted", async () => {
        const { relay, calls } = harness();
        await relay(
            chatRequest(AI_CHAT_COMPLETIONS_PATH, {
                messages: [{ role: "user", content: "hi" }],
            }),
        );
        expect(upstreamBody(calls).model).toBe("text-model");
    });

    test("chat rejects an unknown model id without calling upstream", async () => {
        const { relay, calls } = harness();
        const res = await relay(
            chatRequest(AI_CHAT_COMPLETIONS_PATH, {
                model: "gpt-unlisted",
                messages: [{ role: "user", content: "hi" }],
            }),
        );
        expect(res?.status).toBe(400);
        expect(await res?.json()).toMatchObject({
            error: { message: expect.stringContaining("不支持的模型") },
        });
        expect(calls.some((call) => call.url === UPSTREAM)).toBe(false);
    });

    test("text-only models get tools stripped", async () => {
        const { relay, calls } = harness();
        await relay(
            chatRequest(AI_CHAT_COMPLETIONS_PATH, {
                model: "text-model",
                messages: [{ role: "user", content: "hi" }],
                tools: [{ type: "function", function: { name: "x" } }],
                tool_choice: "auto",
            }),
        );
        const body = upstreamBody(calls);
        expect(body.tools).toBeUndefined();
        expect(body.tool_choice).toBeUndefined();
    });

    test("tool-enabled models keep tools", async () => {
        const { relay, calls } = harness();
        await relay(
            chatRequest(AI_CHAT_COMPLETIONS_PATH, {
                model: "vision-model",
                messages: [{ role: "user", content: "hi" }],
                tools: [{ type: "function", function: { name: "x" } }],
            }),
        );
        expect(Array.isArray(upstreamBody(calls).tools)).toBe(true);
    });

    test("vision capability is enforced server-side", async () => {
        const { relay, calls } = harness();
        const res = await relay(
            chatRequest(AI_CHAT_COMPLETIONS_PATH, {
                model: "text-model",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "what is this?" },
                            {
                                type: "image_url",
                                image_url: { url: "data:image/jpeg;base64,AA" },
                            },
                        ],
                    },
                ],
            }),
        );
        expect(res?.status).toBe(400);
        expect(await res?.json()).toMatchObject({
            error: { message: expect.stringContaining("不支持图片") },
        });
        expect(calls.some((call) => call.url === UPSTREAM)).toBe(false);
    });

    test("vision model accepts image parts", async () => {
        const { relay } = harness();
        const res = await relay(
            chatRequest(AI_CHAT_COMPLETIONS_PATH, {
                model: "vision-model",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "image_url",
                                image_url: { url: "data:image/jpeg;base64,AA" },
                            },
                        ],
                    },
                ],
            }),
        );
        expect(res?.status).toBe(200);
    });

    test("passes a supported thinking level through", async () => {
        const { relay, calls } = harness();
        const res = await relay(
            chatRequest(AI_CHAT_COMPLETIONS_PATH, {
                model: "vision-model",
                messages: [{ role: "user", content: "hi" }],
                reasoning_effort: "high",
            }),
        );
        expect(res?.status).toBe(200);
        expect(upstreamBody(calls).reasoning_effort).toBe("high");
    });

    test("rejects a thinking level the model does not support", async () => {
        const { relay, calls } = harness();
        for (const effort of ["max", "ultra"]) {
            const res = await relay(
                chatRequest(AI_CHAT_COMPLETIONS_PATH, {
                    model: "vision-model",
                    messages: [{ role: "user", content: "hi" }],
                    reasoning_effort: effort,
                }),
            );
            expect(res?.status).toBe(400);
            expect(await res?.json()).toMatchObject({
                error: { message: expect.stringContaining("思考强度") },
            });
        }
        expect(calls.some((call) => call.url === UPSTREAM)).toBe(false);
    });

    test("rejects any thinking level for a model without effort control", async () => {
        const { relay } = harness();
        const res = await relay(
            chatRequest(AI_CHAT_COMPLETIONS_PATH, {
                model: "text-model",
                messages: [{ role: "user", content: "hi" }],
                reasoning_effort: "low",
            }),
        );
        expect(res?.status).toBe(400);
    });

    test("omits reasoning_effort when the conversation uses the default", async () => {
        const { relay, calls } = harness();
        await relay(
            chatRequest(AI_CHAT_COMPLETIONS_PATH, {
                model: "vision-model",
                messages: [{ role: "user", content: "hi" }],
                reasoning_effort: "",
            }),
        );
        expect(upstreamBody(calls).reasoning_effort).toBeUndefined();
    });

    test("legacy endpoint still forces one model and ignores the allowlist", async () => {
        const { relay, calls } = harness();
        await relay(
            chatRequest(AI_CHAT_PATH, {
                model: "vision-model",
                messages: [{ role: "user", content: "hi" }],
            }),
        );
        expect(upstreamBody(calls).model).toBe("legacy-model");
    });
});
