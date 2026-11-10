import { beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import {
    clearAiCache,
    hashText,
    readAiCache,
    removeAiCache,
    sha256,
    sha256Sync,
    writeAiCache,
} from "./cache";
import { AI_MODEL } from "./constants";
import { PROMPT_VERSION } from "./prompt-base";

let store: Map<string, string>;

beforeEach(() => {
    store = new Map<string, string>();
    (globalThis as unknown as { window: unknown }).window = globalThis;
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, String(value)),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
        key: (index: number) => [...store.keys()][index] ?? null,
        get length() {
            return store.size;
        },
    };
});

describe("缓存信封", () => {
    test("写入后读出的是 data，且信封带版本 / 模型 / 提示词版本 / TTL", () => {
        writeAiCache("k", { a: 1 });
        const raw = store.get("mimi:ai-cache:v1:k");
        expect(raw).toBeDefined();
        const env = JSON.parse(raw!);
        expect(env.v).toBe(1);
        expect(env.model).toBe(AI_MODEL);
        expect(env.promptVersion).toBe(PROMPT_VERSION);
        expect(env.ttl).toBeGreaterThan(0);
        expect(env.createdAt).toBeGreaterThan(0);
        expect(readAiCache<{ a: number }>("k")).toEqual({ a: 1 });
    });

    test("旧格式（裸值）被 zod 判为无效并作废", () => {
        store.set("mimi:ai-cache:v1:legacy", JSON.stringify({ a: 1 }));
        expect(readAiCache("legacy")).toBeNull();
    });

    test("TTL 过期返回 null 并清掉这条", () => {
        writeAiCache("expired", "x", { ttlMs: -1 });
        expect(readAiCache("expired")).toBeNull();
        expect(store.has("mimi:ai-cache:v1:expired")).toBe(false);
    });

    test("信封里的模型和当前 AI_MODEL 不一致时作废", () => {
        writeAiCache("k", "v1");
        const env = JSON.parse(store.get("mimi:ai-cache:v1:k")!);
        env.model = "another-model";
        store.set("mimi:ai-cache:v1:k", JSON.stringify(env));
        expect(readAiCache("k")).toBeNull();
    });

    test("改了 promptVersion 的信封作废", () => {
        writeAiCache("k", "v1");
        const env = JSON.parse(store.get("mimi:ai-cache:v1:k")!);
        env.promptVersion = "old";
        store.set("mimi:ai-cache:v1:k", JSON.stringify(env));
        expect(readAiCache("k")).toBeNull();
    });

    test("remove / clear 都能清干净", () => {
        writeAiCache("a", 1);
        writeAiCache("b", 2);
        removeAiCache("a");
        expect(readAiCache("a")).toBeNull();
        expect(readAiCache("b")).toBe(2);
        clearAiCache();
        expect(readAiCache("b")).toBeNull();
    });
});

describe("SHA-256 keys", () => {
    test("同步版与 crypto.subtle 版结果一致", async () => {
        const text = "午饭 25 + 打车 18";
        expect(await sha256(text)).toBe(sha256Sync(text));
    });

    test("hashText 稳定、够长、不同输入不同", () => {
        expect(hashText("abc")).toBe(hashText("abc"));
        expect(hashText("abc")).not.toBe(hashText("abd"));
        expect(hashText("abc").length).toBe(32);
        // 与 Node crypto 对齐，确认是真的 SHA-256 前半段
        expect(hashText("abc")).toBe(
            createHash("sha256").update("abc").digest("hex").slice(0, 32),
        );
    });
});
