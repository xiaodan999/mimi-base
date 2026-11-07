import { useMemo } from "react";
import {
    useExternalStoreRuntime,
    WebSpeechSynthesisAdapter,
    type AppendMessage,
    type MessageStatus,
    type ThreadMessageLike,
} from "@assistant-ui/react";

import type { ChatMessage, ChatModel, ChatPart } from "@/app/chat/types";

import type { LiveReply } from "../-use-chat-session";

/** One speechSynthesis instance is enough for the whole app. */
const speechAdapter = new WebSpeechSynthesisAdapter();

/** assistant-ui's message shape, kept in sync with our stored parts. */
function toThreadPart(part: ChatPart): unknown {
    switch (part.type) {
        case "text":
            return { type: "text", text: part.text };
        case "reasoning":
            return { type: "reasoning", text: part.text };
        case "image":
            return {
                type: "image",
                image: part.image,
                ...(part.filename ? { filename: part.filename } : {}),
            };
        case "artifact":
            // assistant-ui renders `data` parts through the `data.by_name`
            // slot; the artifact card is registered under the name below.
            return { type: "data", name: "artifact", data: part };
        case "tool-call": {
            let args: Record<string, unknown> | undefined;
            try {
                const parsed = JSON.parse(part.argsText) as unknown;
                if (
                    typeof parsed === "object" &&
                    parsed !== null &&
                    !Array.isArray(parsed)
                ) {
                    args = parsed as Record<string, unknown>;
                }
            } catch {
                // streaming arguments may be incomplete; argsText still shows
            }
            return {
                type: "tool-call",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                argsText: part.argsText,
                ...(args ? { args } : {}),
                ...(part.result !== undefined ? { result: part.result } : {}),
                ...(part.isError ? { isError: true } : {}),
            };
        }
        default:
            return { type: "text", text: "" };
    }
}

function messageStatus(message: ChatMessage): MessageStatus {
    if (message.status === "error") {
        return {
            type: "incomplete",
            reason: "error",
            error: message.error ?? "AI 请求失败",
        };
    }
    if (message.status === "stopped") {
        return { type: "incomplete", reason: "cancelled" };
    }
    return { type: "complete", reason: "stop" };
}

export type ChatThreadMessage = ThreadMessageLike & { createdAt?: Date };

export function toThreadMessage(message: ChatMessage): ChatThreadMessage {
    const content = message.parts.map((part) => toThreadPart(part) as never);
    // Render the provider/relay error as a data part (assistant-ui's error
    // state only carries the value; this is what shows the actual message).
    if (
        message.role === "assistant" &&
        message.status === "error" &&
        message.error
    ) {
        content.push({
            type: "data-error",
            data: { message: message.error },
        } as never);
    }
    return {
        id: message.id,
        role: message.role,
        createdAt: new Date(message.createdAt),
        // assistant-ui only accepts a status on assistant messages; a user
        // message with one throws from `fromThreadMessageLike`.
        ...(message.role === "assistant"
            ? { status: messageStatus(message) }
            : {}),
        content,
    };
}

export function liveThreadMessage(live: LiveReply): ChatThreadMessage {
    return {
        id: live.id,
        role: "assistant",
        createdAt: new Date(),
        status: { type: "running" },
        content: live.parts.map((part) => toThreadPart(part) as never),
    };
}

/** Pull text/image parts out of an assistant-ui append message. */
export function appendMessageParts(message: AppendMessage): ChatPart[] {
    const parts: ChatPart[] = [];
    const content = Array.isArray(message.content) ? message.content : [];
    for (const raw of content) {
        if (typeof raw !== "object" || raw === null) continue;
        const part = raw as {
            type?: unknown;
            text?: unknown;
            image?: unknown;
            filename?: unknown;
        };
        if (part.type === "text" && typeof part.text === "string") {
            const text = part.text.trim();
            if (text !== "") parts.push({ type: "text", text });
        }
        if (part.type === "image" && typeof part.image === "string") {
            if (part.image.startsWith("data:image/")) {
                parts.push({
                    type: "image",
                    image: part.image,
                    ...(typeof part.filename === "string"
                        ? { filename: part.filename }
                        : {}),
                });
            }
        }
    }
    return parts;
}

export type UseChatRuntimeArgs = {
    messages: readonly ChatMessage[];
    live: LiveReply | null;
    running: boolean;
    onSend: (parts: ChatPart[]) => Promise<void>;
    onStop: () => void;
    onRegenerate: (
        parentId: string,
        opts?: { model: ChatModel },
    ) => Promise<void>;
    onEdit?: (message: AppendMessage) => Promise<void>;
};

/**
 * Bridges the PocketBase-backed message list to assistant-ui's external store
 * runtime. The runtime renders, keys, scrolls and exposes actions; every
 * mutation still goes through our own store.
 */
export function useChatRuntime({
    messages,
    live,
    running,
    onSend,
    onStop,
    onRegenerate,
    onEdit,
}: UseChatRuntimeArgs) {
    const threadMessages = useMemo(() => {
        const list = messages.map(toThreadMessage);
        if (live) list.push(liveThreadMessage(live));
        return list;
    }, [messages, live]);

    return useExternalStoreRuntime<ChatThreadMessage>({
        messages: threadMessages,
        isRunning: running,
        convertMessage: (message) => message,
        onNew: async (message) => {
            const parts = appendMessageParts(message);
            if (parts.length === 0) return;
            await onSend(parts);
        },
        onCancel: async () => {
            onStop();
        },
        onReload: async (parentId) => {
            if (!parentId) return;
            await onRegenerate(parentId);
        },
        // Providing onEdit is what turns the Edit button on; omitting it
        // keeps the button auto-disabled.
        ...(onEdit
            ? { onEdit: async (message: AppendMessage) => onEdit(message) }
            : {}),
        // Read-aloud uses the browser's speechSynthesis (no provider, no key).
        adapters: { speech: speechAdapter },
    });
}
