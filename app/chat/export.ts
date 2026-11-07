import { TOOL_TITLES } from "./tool-labels";
import type { ChatConversation, ChatMessage } from "./types";

/**
 * Export a conversation as Markdown: text parts verbatim, tool calls as
 * one-line summaries, images as placeholders (the stored data URLs are not
 * portable). Pure so the shape is unit-testable.
 */

function dateLabel(value: string): string {
    const date = new Date(value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return value;
    const pad = (input: number) => String(input).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function messageLines(message: ChatMessage): string[] {
    const lines: string[] = [];
    const speaker = message.role === "user" ? "我" : "AI";
    lines.push(`### ${speaker}`);
    for (const part of message.parts) {
        switch (part.type) {
            case "text":
                if (part.text.trim() !== "") lines.push(part.text.trim());
                break;
            case "image":
                lines.push("[图片]");
                break;
            case "artifact":
                lines.push(
                    part.source === "file"
                        ? `[图片 ${part.name}]`
                        : `[文件 ${part.name}]`,
                );
                break;
            case "tool-call": {
                const title = TOOL_TITLES[part.toolName] ?? part.toolName;
                if (part.isError) {
                    lines.push(`> ${title}：失败`);
                } else {
                    lines.push(`> ${title}`);
                }
                break;
            }
            case "reasoning":
                // chain of thought is display-only; skip in exports
                break;
        }
    }
    if (message.status === "error" && message.error) {
        lines.push(`> 出错：${message.error}`);
    }
    return lines;
}

export function conversationToMarkdown(
    conversation: ChatConversation,
    messages: readonly ChatMessage[],
): string {
    const header = [
        `# ${conversation.title}`,
        "",
        `> 人格：${conversation.personaName || "通用助手"} · 导出于 ${dateLabel(new Date().toISOString())}`,
        "",
    ];
    const body = messages.flatMap((message) => [...messageLines(message), ""]);
    return [...header, ...body].join("\n").trimEnd() + "\n";
}

/** Filesystem-safe markdown filename for a conversation. */
export function markdownFilename(title: string): string {
    const safe = title
        .replace(/[\\/:*?"<>|]/g, "")
        .trim()
        .slice(0, 60);
    return `${safe || "对话"}.md`;
}
