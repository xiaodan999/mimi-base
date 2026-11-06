import { describe, expect, test } from "bun:test";

import {
    findChatModel,
    hasImagePart,
    normalizeModelId,
    normalizeThinkingLevel,
    pickDefaultChatModel,
    resolveChatModels,
} from "./chat-models";

describe("resolveChatModels", () => {
    test("exposes exactly the three chat models by default", () => {
        const models = resolveChatModels();
        expect(models.map((model) => model.id)).toEqual([
            "deepseek-v4.1-flash",
            "glm-5.3-flash",
            "mimo-v2.6-flash",
        ]);
        expect(models.every((model) => model.vision)).toBe(true);
        expect(models.every((model) => model.tools)).toBe(true);
    });

    test("only DeepSeek and GLM expose thinking levels", () => {
        const models = resolveChatModels();
        expect(
            models.find((model) => model.id === "deepseek-v4.1-flash")
                ?.thinkingLevels,
        ).toEqual(["low", "high", "max"]);
        expect(
            models.find((model) => model.id === "glm-5.3-flash")
                ?.thinkingLevels,
        ).toEqual(["low", "high", "max"]);
        expect(
            models.find((model) => model.id === "mimo-v2.6-flash")
                ?.thinkingLevels,
        ).toEqual([]);
    });

    test("an env allowlist narrows the list and keeps order", () => {
        const models = resolveChatModels("glm-5.3-flash, deepseek-v4.1-flash");
        expect(models.map((model) => model.id)).toEqual([
            "glm-5.3-flash",
            "deepseek-v4.1-flash",
        ]);
        expect(models[0]?.label).toBe("GLM-5.3 Flash");
        expect(models[0]?.vision).toBe(true);
    });

    test("unknown env ids get conservative capabilities", () => {
        const models = resolveChatModels("custom-model");
        expect(models).toEqual([
            {
                id: "custom-model",
                label: "custom-model",
                vision: false,
                tools: true,
                reasoning: true,
                thinkingLevels: [],
            },
        ]);
    });

    test("duplicates in the env list are dropped", () => {
        const models = resolveChatModels("a,a,b");
        expect(models.map((model) => model.id)).toEqual(["a", "b"]);
    });

    test("an empty allowlist exposes the catalog", () => {
        const models = resolveChatModels(" , ");
        expect(models).toHaveLength(3);
        expect(pickDefaultChatModel([], "x")).toBeNull();
    });
});

describe("pickDefaultChatModel", () => {
    const models = resolveChatModels();

    test("prefers the configured default", () => {
        expect(pickDefaultChatModel(models, "glm-5.3-flash")).toBe(
            "glm-5.3-flash",
        );
    });

    test("falls back to the first allowed model", () => {
        expect(pickDefaultChatModel(models, "not-allowed")).toBe(
            "deepseek-v4.1-flash",
        );
    });
});

describe("findChatModel", () => {
    test("finds by id", () => {
        const models = resolveChatModels();
        expect(findChatModel(models, "mimo-v2.6-flash")?.id).toBe(
            "mimo-v2.6-flash",
        );
        expect(findChatModel(models, "zzz")).toBeUndefined();
    });
});

describe("normalizeThinkingLevel", () => {
    test("accepts the supported levels", () => {
        expect(normalizeThinkingLevel("low")).toBe("low");
        expect(normalizeThinkingLevel(" HIGH ")).toBe("high");
        expect(normalizeThinkingLevel("max")).toBe("max");
    });

    test("rejects anything else", () => {
        expect(normalizeThinkingLevel("medium")).toBe("");
        expect(normalizeThinkingLevel("")).toBe("");
        expect(normalizeThinkingLevel(42)).toBe("");
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
