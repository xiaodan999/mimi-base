import { describe, expect, test } from "bun:test";

import {
    findChatModel,
    hasImagePart,
    normalizeModelId,
    pickDefaultChatModel,
    resolveChatModels,
} from "./chat-models";

describe("resolveChatModels", () => {
    test("exposes the catalog plus an unknown legacy model", () => {
        const models = resolveChatModels("unknown-model");
        expect(models.map((model) => model.id)).toContain("unknown-model");
        expect(models.map((model) => model.id)).toContain(
            "deepseek-v4.1-flash",
        );
        expect(models[0]?.id).toBe("unknown-model");
        expect(models[0]?.label).toBe("unknown-model");
        expect(models[0]?.vision).toBe(false);
    });

    test("does not duplicate a legacy model already in the catalog", () => {
        const models = resolveChatModels("deepseek-v4.1-flash");
        expect(
            models.filter((model) => model.id === "deepseek-v4.1-flash"),
        ).toHaveLength(1);
    });

    test("an env allowlist narrows the list and keeps order", () => {
        const models = resolveChatModels("legacy", "gpt-5.5, qwen3.8-max");
        expect(models.map((model) => model.id)).toEqual([
            "gpt-5.5",
            "qwen3.8-max",
        ]);
        expect(models[0]?.vision).toBe(true);
    });

    test("unknown env ids get conservative capabilities", () => {
        const models = resolveChatModels("legacy", "custom-model");
        expect(models).toEqual([
            {
                id: "custom-model",
                label: "custom-model",
                vision: false,
                tools: true,
                reasoning: true,
            },
        ]);
    });

    test("duplicates in the env list are dropped", () => {
        const models = resolveChatModels("legacy", "a,a,b");
        expect(models.map((model) => model.id)).toEqual(["a", "b"]);
    });

    test("an empty allowlist exposes the catalog", () => {
        const models = resolveChatModels("legacy", " , ");
        expect(models.length).toBeGreaterThan(1);
        expect(pickDefaultChatModel([], "x")).toBeNull();
    });
});

describe("pickDefaultChatModel", () => {
    const models = resolveChatModels("legacy", "a,b");

    test("prefers the configured default", () => {
        expect(pickDefaultChatModel(models, "b")).toBe("b");
    });

    test("falls back to the first allowed model", () => {
        expect(pickDefaultChatModel(models, "not-allowed")).toBe("a");
    });
});

describe("findChatModel", () => {
    test("finds by id", () => {
        const models = resolveChatModels("legacy", "a");
        expect(findChatModel(models, "a")?.id).toBe("a");
        expect(findChatModel(models, "zzz")).toBeUndefined();
    });
});

describe("hasImagePart", () => {
    test("detects image parts in message content", () => {
        expect(
            hasImagePart([
                {
                    role: "user",
                    content: [
                        { type: "text", text: "hi" },
                        { type: "image_url", image_url: { url: "data:," } },
                    ],
                },
            ]),
        ).toBe(true);
    });

    test("returns false for plain text", () => {
        expect(hasImagePart([{ role: "user", content: "hi" }])).toBe(false);
        expect(hasImagePart(undefined)).toBe(false);
    });
});

describe("normalizeModelId", () => {
    test("trims and bounds the id", () => {
        expect(normalizeModelId("  model  ")).toBe("model");
        expect(normalizeModelId(42)).toBe("");
        expect(normalizeModelId("x".repeat(80))).toHaveLength(64);
    });
});
