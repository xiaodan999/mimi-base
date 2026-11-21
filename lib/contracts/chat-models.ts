/**
 * Chat model allowlist contract shared by the Bun API and the browser.
 *
 * The catalog itself stays on the server (`server/ai/models.ts`); the client
 * only renders what `GET /api/ai/models` returns and never picks an id
 * outside that list.
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

export type ChatModelsResponse = {
    models: ChatModelInfo[];
    defaultModel: string;
    keyConfigured: boolean;
};
