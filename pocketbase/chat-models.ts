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
 * button, and the relay refuses image parts sent to one anyway.
 */

export type ChatModelInfo = {
    id: string;
    label: string;
    /** Accepts image parts. */
    vision: boolean;
    /** Can call the sandbox / other tools. */
    tools: boolean;
    /** Streams chain of thought (`reasoning_content` deltas). */
    reasoning: boolean;
};

/**
 * Best-effort catalog of OpenCode Zen ids. Only the entries the site's Go
 * plan actually serves will work; narrow the list with
 * `OPENCODE_CHAT_MODELS` to hide the rest.
 */
const CATALOG: readonly ChatModelInfo[] = [
    {
        id: "deepseek-v4.1-flash",
        label: "DeepSeek V4.1 Flash",
        vision: false,
        tools: true,
        reasoning: true,
    },
    {
        id: "deepseek-v4-pro",
        label: "DeepSeek V4 Pro",
        vision: false,
        tools: true,
        reasoning: true,
    },
    {
        id: "glm-5.3",
        label: "GLM-5.3",
        vision: false,
        tools: true,
        reasoning: true,
    },
    {
        id: "kimi-k2.5",
        label: "Kimi K2.5",
        vision: false,
        tools: true,
        reasoning: true,
    },
    {
        id: "qwen3.8-max",
        label: "Qwen3.8 Max",
        vision: true,
        tools: true,
        reasoning: true,
    },
    {
        id: "claude-sonnet-4-5",
        label: "Claude Sonnet 4.5",
        vision: true,
        tools: true,
        reasoning: true,
    },
    {
        id: "gpt-5.5",
        label: "GPT-5.5",
        vision: true,
        tools: true,
        reasoning: true,
    },
];

/** Ids are opaque strings; trim only, so odd-but-valid ids survive. */
export function normalizeModelId(value: unknown): string {
    return typeof value === "string" ? value.trim().slice(0, 64) : "";
}

/**
 * Build the enabled list. With no `OPENCODE_CHAT_MODELS`, every catalog entry
 * is enabled (and the legacy `OPENCODE_MODEL` is added if the catalog does
 * not know it yet). With the env set, only those ids are exposed; an id the
 * catalog does not know gets conservative flags (text-only, tools,
 * reasoning) and its id as the label.
 */
export function resolveChatModels(
    legacyModel: string,
    rawAllowlist?: string,
): ChatModelInfo[] {
    const ids = (rawAllowlist ?? "")
        .split(",")
        .map((value) => normalizeModelId(value))
        .filter((value) => value !== "");

    if (ids.length === 0) {
        const models = [...CATALOG];
        const legacy = normalizeModelId(legacyModel);
        if (legacy && !models.some((model) => model.id === legacy)) {
            models.unshift({
                id: legacy,
                label: legacy,
                vision: false,
                tools: true,
                reasoning: true,
            });
        }
        return models;
    }

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
