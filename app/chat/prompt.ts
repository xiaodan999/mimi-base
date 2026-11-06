import type { ChatMessage, ChatPart } from "./types";

/**
 * Converts stored display messages into the OpenAI-compatible message list.
 * Reasoning parts are display-only and never sent back; tool results are
 * replayed as `role: "tool"` messages so the model can continue a tool loop
 * after a reload.
 */

export type ChatApiContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

export type ChatApiToolCall = {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
};

export type ChatApiMessage =
    | { role: "system"; content: string }
    | { role: "user"; content: string | ChatApiContentPart[] }
    | {
          role: "assistant";
          content: string | null;
          tool_calls?: ChatApiToolCall[];
      }
    | { role: "tool"; tool_call_id: string; content: string };

export const BASE_SYSTEM_PROMPT =
    "你是 mimi-base 里的通用 AI 助手，和用户一对一聊天。回答用简体中文（除非用户要求其他语言），可以直接、具体，不要堆砌客套话。使用 Markdown 组织长回答，代码块标注语言。需要计算、验证代码或查实时信息时，可以调用 sandbox_* 工具在服务器的隔离沙箱里运行 Python（标准库）或 JavaScript（Node）：沙箱能访问公网 HTTP/HTTPS（天气 API、网页等），但不能访问本站内网、PocketBase，也读不到本站的文件或密钥。文件只在本次对话里保存。";

export function buildSystemPrompt(personaPrompt: string): string {
    const persona = personaPrompt.trim();
    return persona
        ? `${BASE_SYSTEM_PROMPT}\n\n当前人格设定：\n${persona}`
        : BASE_SYSTEM_PROMPT;
}

function textOf(parts: readonly ChatPart[]): string {
    return parts
        .filter(
            (part): part is Extract<ChatPart, { type: "text" }> =>
                part.type === "text",
        )
        .map((part) => part.text)
        .join("\n\n")
        .trim();
}

function imagesOf(parts: readonly ChatPart[]): string[] {
    return parts.flatMap((part) =>
        part.type === "image" && part.image ? [part.image] : [],
    );
}

function userContent(
    parts: readonly ChatPart[],
): string | ChatApiContentPart[] {
    const text = textOf(parts);
    const images = imagesOf(parts);
    if (images.length === 0) return text;
    return [
        { type: "text", text },
        ...images.map((image) => ({
            type: "image_url" as const,
            image_url: { url: image },
        })),
    ];
}

/** Tool results are sent back as compact JSON (or the raw string). */
export function toolResultText(result: unknown, maxChars = 12_000): string {
    let text: string;
    if (typeof result === "string") {
        text = result;
    } else {
        try {
            text = JSON.stringify(result) ?? "";
        } catch {
            text = String(result);
        }
    }
    return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

/**
 * Build the request messages. `maxHistory` keeps long chats inside a sane
 * context: older messages are dropped together with their tool calls, and a
 * leading `tool` message is never left orphaned.
 */
export function buildApiMessages(
    messages: readonly ChatMessage[],
    personaPrompt: string,
    options: { maxHistory?: number } = {},
): ChatApiMessage[] {
    const maxHistory = options.maxHistory ?? 80;
    const window =
        messages.length > maxHistory
            ? messages.slice(messages.length - maxHistory)
            : messages;
    // Trimming can cut into a turn. Start on a user message so the provider
    // never sees an orphaned tool result or a reply without its question.
    const firstUser = window.findIndex((message) => message.role === "user");
    const trimmed = firstUser > 0 ? window.slice(firstUser) : window;

    const result: ChatApiMessage[] = [
        { role: "system", content: buildSystemPrompt(personaPrompt) },
    ];

    for (const message of trimmed) {
        if (message.role === "user") {
            const content = userContent(message.parts);
            if (typeof content === "string" && content === "") continue;
            result.push({ role: "user", content });
            continue;
        }

        const text = textOf(message.parts);
        const calls = message.parts.filter(
            (part): part is Extract<ChatPart, { type: "tool-call" }> =>
                part.type === "tool-call",
        );
        if (!text && calls.length === 0) continue;

        if (calls.length === 0) {
            result.push({ role: "assistant", content: text });
            continue;
        }

        result.push({
            role: "assistant",
            content: text || null,
            tool_calls: calls.map((call) => ({
                id: call.toolCallId,
                type: "function",
                function: {
                    name: call.toolName,
                    arguments: call.argsText.trim() || "{}",
                },
            })),
        });
        for (const call of calls) {
            if (call.result === undefined) continue;
            result.push({
                role: "tool",
                tool_call_id: call.toolCallId,
                content: toolResultText(call.result),
            });
        }
    }

    // Trimming already starts the list on a user turn, so no orphan tool
    // result can end up right after the system prompt.
    return result;
}
