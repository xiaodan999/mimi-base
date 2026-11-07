/**
 * Chat domain types shared by the route, the assistant-ui adapter and the
 * PocketBase mappers.
 *
 * Stored messages keep assistant-ui's part shape (`text` / `reasoning` /
 * `image` / `tool-call`) so a reload can rebuild the thread without a
 * lossy conversion. The model context is built separately (see `prompt.ts`)
 * because reasoning text is display-only.
 */

export type ChatModel = {
    id: string;
    label: string;
    vision: boolean;
    tools: boolean;
    reasoning: boolean;
    /** `reasoning_effort` values the model accepts; empty = not adjustable. */
    thinkingLevels: string[];
    /** Context window in tokens; 0 when the server does not know. */
    contextWindow: number;
};

export type ChatRole = "user" | "assistant";

export type ChatToolCallPart = {
    type: "tool-call";
    toolCallId: string;
    toolName: string;
    /** Raw streamed arguments; may be incomplete while running. */
    argsText: string;
    result?: unknown;
    isError?: boolean;
};

export type ChatTextPart = { type: "text"; text: string };
export type ChatReasoningPart = { type: "reasoning"; text: string };
export type ChatImagePart = {
    type: "image";
    image: string;
    filename?: string;
};

export type ChatPart =
    ChatTextPart | ChatReasoningPart | ChatImagePart | ChatToolCallPart;

export type ChatMessageStatus = "complete" | "stopped" | "error";

export type ChatUsage = {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
};

export type ChatMessage = {
    id: string;
    conversationId: string;
    role: ChatRole;
    parts: ChatPart[];
    /** Plain text copy for previews and copy-to-clipboard fallbacks. */
    content: string;
    model: string;
    seq: number;
    status: ChatMessageStatus;
    error?: string;
    usage?: ChatUsage;
    createdAt: string;
};

import type { SandboxFiles } from "@/lib/sandbox-protocol";

export type { SandboxFiles };

export type ChatConversation = {
    id: string;
    title: string;
    model: string;
    /** "" = provider default, otherwise "low" / "high" / "max". */
    thinking: string;
    personaId: string;
    personaName: string;
    personaPrompt: string;
    sandboxFiles: SandboxFiles;
    lastMessage: string;
    pinned: boolean;
    createdAt: string;
    updatedAt: string;
};

export type ChatPersona = {
    /** `builtin:*` for code-defined personas, a PB record id otherwise. */
    id: string;
    name: string;
    icon: string;
    description: string;
    prompt: string;
    builtin: boolean;
    /** Short prompts offered on the empty thread; built-ins only. */
    starters?: readonly string[];
};

/** A durable fact the model saved about the user (`memory` tool). */
export type ChatMemory = {
    id: string;
    content: string;
    createdAt: string;
};
