/**
 * Server-owned allowlist for the general chat (`/chat`).
 *
 * The browser never chooses a model freely: `GET /ai/models` returns this
 * list and the relay rejects any other id. The catalog lives here (not in
 * PocketBase) so deploying a new model is a code change on the server, and
 * an operator can narrow it with `OPENCODE_CHAT_MODELS` (comma separated ids)
 * without touching the client.
 *
 * Capability flags drive the UI: a text-only model hides the image attach
 * button, and the relay refuses image parts sent to one anyway. Models with
 * `thinkingLevels` expose the per-conversation reasoning effort picker; the
 * relay rejects an effort the model does not support.
 */

export const CHAT_THINKING_LEVELS = ["low", "high", "max"] as const;

export type ChatThinkingLevel = (typeof CHAT_THINKING_LEVELS)[number];

export type ChatModelInfo = {
    id: string;
    label: string;
    /** Accepts image parts. */
    vision: boolean;
    /** Can call the sandbox / other tools. */
    tools: boolean;
    /** Streams chain of thought (`reasoning_content` deltas). */
    reasoning: boolean;
    /** `reasoning_effort` values the model accepts; empty = not adjustable. */
    thinkingLevels: readonly ChatThinkingLevel[];
    /** Context window in tokens; 0 when unknown. */
    contextWindow: number;
};

/**
 * The three models the chat exposes. All of them accept images and tools.
 * DeepSeek and GLM can tune reasoning effort; MiMo always thinks at its
 * default level.
 */
const CATALOG: readonly ChatModelInfo[] = [
    {
        id: "deepseek-v4.1-flash",
        label: "DeepSeek V4.1 Flash",
        vision: true,
        tools: true,
        reasoning: true,
        thinkingLevels: ["low", "high", "max"],
        contextWindow: 1_000_000,
    },
    {
        id: "glm-5.3-flash",
        label: "GLM-5.3 Flash",
        vision: true,
        tools: true,
        reasoning: true,
        thinkingLevels: ["low", "high", "max"],
        contextWindow: 1_000_000,
    },
    {
        id: "mimo-v2.6-flash",
        label: "MiMo 2.6 Flash",
        vision: true,
        tools: true,
        reasoning: true,
        thinkingLevels: [],
        contextWindow: 1_048_576,
    },
];

/** Ids are opaque strings; trim only, so odd-but-valid ids survive. */
export function normalizeModelId(value: unknown): string {
    return typeof value === "string" ? value.trim().slice(0, 64) : "";
}

/** Empty string means "use the provider's default effort". */
export function normalizeThinkingLevel(value: unknown): ChatThinkingLevel | "" {
    const level = typeof value === "string" ? value.trim().toLowerCase() : "";
    return (CHAT_THINKING_LEVELS as readonly string[]).includes(level)
        ? (level as ChatThinkingLevel)
        : "";
}

/**
 * Build the enabled list. With no `OPENCODE_CHAT_MODELS`, the three catalog
 * models are exposed. With the env set, only those ids are exposed; an id the
 * catalog does not know gets conservative flags (text-only, tools,
 * reasoning, no effort control) and its id as the label.
 */
export function resolveChatModels(rawAllowlist?: string): ChatModelInfo[] {
    const ids = (rawAllowlist ?? "")
        .split(",")
        .map((value) => normalizeModelId(value))
        .filter((value) => value !== "");

    if (ids.length === 0) return [...CATALOG];

    const seen = new Set<string>();
    const models: ChatModelInfo[] = [];
    for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        const known = CATALOG.find((model) => model.id === id);
        models.push(
            known ?? {
                id,
                label: id,
                vision: false,
                tools: true,
                reasoning: true,
                thinkingLevels: [],
                contextWindow: 0,
            },
        );
    }
    return models;
}

/**
 * The default chat model: the legacy `OPENCODE_MODEL` when it is enabled,
 * otherwise the first allowed entry. `null` only when the allowlist is empty,
 * which disables chat (health/models still answer).
 */
export function pickDefaultChatModel(
    models: readonly ChatModelInfo[],
    preferredId: string,
): string | null {
    const preferred = normalizeModelId(preferredId);
    if (preferred && models.some((model) => model.id === preferred)) {
        return preferred;
    }
    return models[0]?.id ?? null;
}

export function findChatModel(
    models: readonly ChatModelInfo[],
    id: string,
): ChatModelInfo | undefined {
    return models.find((model) => model.id === id);
}

/** Does this OpenAI-style message list carry an image part? */
export function hasImagePart(messages: unknown): boolean {
    if (!Array.isArray(messages)) return false;
    for (const message of messages) {
        if (typeof message !== "object" || message === null) continue;
        const content = (message as { content?: unknown }).content;
        if (!Array.isArray(content)) continue;
        for (const part of content) {
            if (typeof part !== "object" || part === null) continue;
            const type = (part as { type?: unknown }).type;
            if (
                type === "image_url" ||
                type === "input_image" ||
                type === "image"
            )
                return true;
        }
    }
    return false;
}
