import { describe, expect, test } from "bun:test";

import {
    discoverModels,
    isDirectOpenCodeBaseUrl,
    migrateAiSettings,
    openCodeRelayBaseUrl,
    pickFallbackModel,
    type AiSettings,
} from "./config";

const settings = (patch: Partial<AiSettings> = {}): AiSettings => ({
    baseUrl: "https://opencode.ai/inference/go/openai/v1",
    model: "deepseek-v4.1-flash",
    apiKey: "oc_test",
    notify: true,
    ...patch,
    dailyBudgetUsd: patch.dailyBudgetUsd ?? 0,
});

describe("OpenCode Go relay", () => {
    test("builds the relay URL without duplicate slashes", () => {
        expect(openCodeRelayBaseUrl("https://mimi.example.com/")).toBe(
            "https://mimi.example.com/api/ai/opencode/v1",
        );
    });

    test("recognizes both official direct endpoints", () => {
        expect(
            isDirectOpenCodeBaseUrl(
                "https://opencode.ai/inference/go/openai/v1",
            ),
        ).toBe(true);
        expect(isDirectOpenCodeBaseUrl("https://opencode.ai/zen/go/v1")).toBe(
            true,
        );
        expect(
            isDirectOpenCodeBaseUrl(
                "https://mimi.example.com/api/ai/opencode/v1",
            ),
        ).toBe(false);
    });

    test("rewrites a saved direct endpoint to the relay", () => {
        const relay = openCodeRelayBaseUrl("http://127.0.0.1:3000");
        const result = migrateAiSettings(settings(), relay);
        expect(result.changed).toBe(true);
        expect(result.settings).toEqual({
            ...settings(),
            baseUrl: relay,
        });
    });

    test("also rewrites a full chat-completions direct URL", () => {
        const relay = openCodeRelayBaseUrl("https://mimi.example.com");
        const result = migrateAiSettings(
            settings({
                baseUrl: "https://opencode.ai/zen/go/v1/chat/completions",
            }),
            relay,
        );
        expect(result.settings.baseUrl).toBe(relay);
    });

    test("moves a saved relay URL to the current origin", () => {
        const result = migrateAiSettings(
            settings({
                baseUrl: "http://127.0.0.1:3000/api/ai/opencode/v1",
            }),
            openCodeRelayBaseUrl("http://192.168.1.20:3000"),
        );
        expect(result.changed).toBe(true);
        expect(result.settings.baseUrl).toBe(
            "http://192.168.1.20:3000/api/ai/opencode/v1",
        );
    });

    test("leaves other providers and an already-current URL alone", () => {
        const relay = openCodeRelayBaseUrl("https://mimi.example.com");
        expect(
            migrateAiSettings(
                settings({ baseUrl: "https://api.deepseek.com/v1" }),
                relay,
            ).changed,
        ).toBe(false);
        expect(
            migrateAiSettings(settings({ baseUrl: relay }), relay).changed,
        ).toBe(false);
    });
});

describe("模型发现与兜底路由", () => {
    test("pickFallbackModel 跳过当前模型、优先聊天类模型", () => {
        expect(
            pickFallbackModel("deepseek-chat", ["deepseek-chat"]),
        ).toBeUndefined();
        expect(
            pickFallbackModel("deepseek-chat", [
                "text-embedding-3",
                "deepseek-chat",
                "qwen-plus",
            ]),
        ).toBe("qwen-plus");
        expect(pickFallbackModel("x", ["embedding-2"])).toBe("embedding-2");
        expect(pickFallbackModel("x", [])).toBeUndefined();
    });

    test("discoverModels 解析 /models 并容错失败", async () => {
        const realFetch = globalThis.fetch;
        try {
            globalThis.fetch = (async () =>
                new Response(
                    JSON.stringify({ data: [{ id: "m1" }, { id: "m2" }, {}] }),
                    { status: 200 },
                )) as unknown as typeof fetch;
            expect(await discoverModels(settings())).toEqual(["m1", "m2"]);

            globalThis.fetch = (async () =>
                new Response("nope", {
                    status: 500,
                })) as unknown as typeof fetch;
            expect(await discoverModels(settings())).toEqual([]);

            globalThis.fetch = (async () => {
                throw new TypeError("CORS");
            }) as unknown as typeof fetch;
            expect(await discoverModels(settings())).toEqual([]);
        } finally {
            globalThis.fetch = realFetch;
        }
    });
});
