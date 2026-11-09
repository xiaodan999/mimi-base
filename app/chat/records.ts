import { MAX_FILE_CHARS, MAX_PAGE_IMAGES } from "@/lib/chat-files";
import {
    MAX_ARTIFACT_BYTES,
    normalizeSandboxPath,
} from "@/lib/sandbox-protocol";

import { textArtifactInfo } from "./artifacts";
import type {
    ChatArtifactPart,
    ChatAttachmentPart,
    ChatConversation,
    ChatMemory,
    ChatMessage,
    ChatMessageStatus,
    ChatPart,
    ChatPersona,
    ChatToolCallPart,
    ChatUsage,
    SandboxFiles,
} from "./types";

/* ------------------------------ PocketBase ------------------------------ */

export type ChatConversationRecord = {
    id: string;
    owner: string;
    title: string;
    model: string;
    thinking?: string;
    persona_id?: string;
    persona_name?: string;
    persona_prompt?: string;
    sandbox_files?: unknown;
    last_message?: string;
    pinned?: boolean;
    created: string;
    updated: string;
};

export type ChatMessageRecord = {
    id: string;
    owner?: string;
    conversation: string;
    role: string;
    status?: string;
    parts?: unknown;
    content?: string;
    error?: string;
    model?: string;
    seq?: number;
    usage?: unknown;
    created: string;
};

export type ChatPersonaRecord = {
    id: string;
    owner?: string;
    name: string;
    prompt: string;
    icon?: string;
    description?: string;
    created: string;
    updated: string;
};

export type ChatArtifactRecord = {
    id: string;
    collectionId?: string;
    owner?: string;
    conversation: string;
    message?: string;
    name: string;
    mime: string;
    size?: number;
    caption?: string;
    file?: string;
    created: string;
};

export type ChatAttachmentRecord = {
    id: string;
    collectionId?: string;
    owner?: string;
    conversation: string;
    message?: string;
    name: string;
    mime: string;
    size?: number;
    kind: string;
    file?: string;
    created: string;
};

export type ChatMemoryRecord = {
    id: string;
    owner?: string;
    content: string;
    source_conversation?: string;
    created: string;
    updated: string;
};

/* -------------------------------- values -------------------------------- */

function asString(value: unknown, max = 0): string {
    if (typeof value !== "string") return "";
    return max > 0 ? value.slice(0, max) : value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value) as unknown;
            return value !== "" && parsed !== null && typeof parsed === "object"
                ? (parsed as Record<string, unknown>)
                : null;
        } catch {
            return null;
        }
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return null;
}

function asArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
        try {
            const parsed = JSON.parse(value) as unknown;
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

/** Keep only well-formed, bounded sandbox files (path -> text). */
export function normalizeSandboxFiles(value: unknown): SandboxFiles {
    const source = asRecord(value);
    if (!source) return {};
    const files: SandboxFiles = {};
    for (const [path, content] of Object.entries(source).slice(0, 50)) {
        if (typeof content !== "string") continue;
        if (path.length === 0 || path.length > 200) continue;
        files[path] = content.slice(0, 200_000);
    }
    return files;
}

function normalizeArtifact(
    raw: Record<string, unknown>,
): ChatArtifactPart | null {
    const caption = asString(raw.caption, 200);
    if (raw.source === "sandbox") {
        const path = normalizeSandboxPath(raw.path);
        if (!path) return null;
        const info = textArtifactInfo(path);
        return {
            type: "artifact",
            source: "sandbox",
            path,
            name: asString(raw.name, 200) || info.name,
            mime: asString(raw.mime, 80) || info.mime,
            ...(caption ? { caption } : {}),
        };
    }
    if (raw.source === "file") {
        const artifactId = asString(raw.artifactId, 64);
        const collectionId = asString(raw.collectionId, 64);
        const file = asString(raw.file, 255);
        const size =
            typeof raw.size === "number" && Number.isFinite(raw.size)
                ? Math.round(raw.size)
                : 0;
        if (!artifactId || !collectionId || !file) return null;
        if (size < 0 || size > MAX_ARTIFACT_BYTES) return null;
        const name = asString(raw.name, 200) || "图片";
        return {
            type: "artifact",
            source: "file",
            artifactId,
            collectionId,
            file,
            name,
            mime: asString(raw.mime, 80) || "image/png",
            size,
            ...(caption ? { caption } : {}),
        };
    }
    return null;
}

function normalizeToolCall(
    raw: Record<string, unknown>,
    index: number,
): ChatToolCallPart | null {
    const toolName = asString(raw.toolName ?? raw.tool_name, 80);
    if (!toolName) return null;
    const toolCallId =
        asString(raw.toolCallId ?? raw.tool_call_id ?? raw.id, 120) ||
        `call-${index}`;
    // read_attachment page images: keep only real data URLs, capped.
    const resultImages = (
        Array.isArray(raw.resultImages) ? raw.resultImages : []
    )
        .filter(
            (image): image is string =>
                typeof image === "string" &&
                image.startsWith("data:image/jpeg;base64,"),
        )
        .slice(0, MAX_PAGE_IMAGES);
    return {
        type: "tool-call",
        toolCallId,
        toolName,
        argsText: asString(raw.argsText ?? raw.arguments, 100_000),
        ...(raw.result !== undefined ? { result: raw.result } : {}),
        ...(raw.isError === true ? { isError: true } : {}),
        ...(resultImages.length > 0 ? { resultImages } : {}),
    };
}

/** Bounded rebuild of a stored attachment part (junk in, part dropped). */
function normalizeAttachment(
    raw: Record<string, unknown>,
): ChatAttachmentPart | null {
    const attachmentId = asString(raw.attachmentId, 64);
    const file = asString(raw.file, 255);
    const name = asString(raw.name, 200);
    if (!attachmentId || !file || !name) return null;
    const kind = raw.kind === "pdf" ? "pdf" : "text";
    const size =
        typeof raw.size === "number" && Number.isFinite(raw.size)
            ? Math.max(0, Math.round(raw.size))
            : 0;
    const pageCount =
        typeof raw.pageCount === "number" &&
        Number.isInteger(raw.pageCount) &&
        raw.pageCount > 0
            ? raw.pageCount
            : undefined;
    const pageImages = (Array.isArray(raw.pageImages) ? raw.pageImages : [])
        .filter(
            (image): image is string =>
                typeof image === "string" &&
                image.startsWith("data:image/jpeg;base64,"),
        )
        .slice(0, MAX_PAGE_IMAGES);
    return {
        type: "attachment",
        attachmentId,
        collectionId: asString(raw.collectionId, 64),
        file,
        name,
        mime:
            asString(raw.mime, 80) ||
            (kind === "pdf" ? "application/pdf" : "text/plain"),
        size,
        kind,
        ...(pageCount !== undefined ? { pageCount } : {}),
        truncated: raw.truncated === true,
        extracted: asString(raw.extracted, MAX_FILE_CHARS),
        pageImages,
    };
}

/** Rebuild a message's content parts from stored JSON, dropping junk. */
export function normalizeParts(value: unknown): ChatPart[] {
    const parts: ChatPart[] = [];
    asArray(value).forEach((raw, index) => {
        if (typeof raw !== "object" || raw === null) return;
        const part = raw as Record<string, unknown>;
        switch (part.type) {
            case "text": {
                const text = asString(part.text);
                if (text) parts.push({ type: "text", text });
                break;
            }
            case "reasoning": {
                const text = asString(part.text);
                if (text) parts.push({ type: "reasoning", text });
                break;
            }
            case "image": {
                const image = asString(part.image);
                if (image.startsWith("data:image/")) {
                    parts.push({
                        type: "image",
                        image,
                        ...(typeof part.filename === "string"
                            ? { filename: part.filename.slice(0, 120) }
                            : {}),
                    });
                }
                break;
            }
            case "artifact": {
                const artifact = normalizeArtifact(part);
                if (artifact) parts.push(artifact);
                break;
            }
            case "attachment": {
                const attachment = normalizeAttachment(part);
                if (attachment) parts.push(attachment);
                break;
            }
            case "tool-call": {
                const call = normalizeToolCall(part, index);
                if (call) parts.push(call);
                break;
            }
            default:
                break;
        }
    });
    return parts;
}

export function messageText(parts: readonly ChatPart[]): string {
    return parts
        .filter(
            (part): part is Extract<ChatPart, { type: "text" }> =>
                part.type === "text",
        )
        .map((part) => part.text)
        .join("\n\n")
        .trim();
}

function normalizeStatus(value: unknown): ChatMessageStatus {
    if (value === "stopped" || value === "error") return value;
    return "complete";
}

function normalizeUsage(value: unknown): ChatUsage | undefined {
    const record = asRecord(value);
    if (!record) return undefined;
    const usage: ChatUsage = {};
    for (const key of [
        "prompt_tokens",
        "completion_tokens",
        "total_tokens",
    ] as const) {
        const number = record[key];
        if (typeof number === "number" && Number.isFinite(number)) {
            usage[key] = Math.max(0, Math.round(number));
        }
    }
    return Object.keys(usage).length > 0 ? usage : undefined;
}

export function toChatConversation(
    record: ChatConversationRecord,
): ChatConversation {
    return {
        id: record.id,
        title: asString(record.title, 120) || "新对话",
        model: asString(record.model, 64),
        thinking: asString(record.thinking, 8),
        personaId: asString(record.persona_id, 80),
        personaName: asString(record.persona_name, 60),
        personaPrompt: asString(record.persona_prompt),
        sandboxFiles: normalizeSandboxFiles(record.sandbox_files),
        lastMessage: asString(record.last_message, 200),
        pinned: record.pinned === true,
        createdAt: record.created,
        updatedAt: record.updated,
    };
}

export function toChatMessage(record: ChatMessageRecord): ChatMessage {
    const parts = normalizeParts(record.parts);
    const usage = normalizeUsage(record.usage);
    return {
        id: record.id,
        conversationId: record.conversation,
        role: record.role === "assistant" ? "assistant" : "user",
        parts,
        content: asString(record.content) || messageText(parts),
        model: asString(record.model, 64),
        seq:
            typeof record.seq === "number" && Number.isFinite(record.seq)
                ? Math.round(record.seq)
                : 0,
        status: normalizeStatus(record.status),
        ...(record.error ? { error: asString(record.error, 300) } : {}),
        ...(usage ? { usage } : {}),
        createdAt: record.created,
    };
}

export function toChatPersona(record: ChatPersonaRecord): ChatPersona {
    return {
        id: record.id,
        name: asString(record.name, 40) || "自定义场景",
        icon: asString(record.icon, 16) || "💬",
        description: asString(record.description, 120),
        prompt: asString(record.prompt),
        builtin: false,
    };
}

export function toChatMemory(record: ChatMemoryRecord): ChatMemory {
    return {
        id: record.id,
        content: asString(record.content, 500),
        createdAt: record.created,
    };
}

/** Short single-line preview stored on the conversation for the list UI. */
export function previewText(text: string, max = 80): string {
    const line = text
        .replace(/\s+/g, " ")
        .replace(/[`*_>#-]+/g, "")
        .trim();
    return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
