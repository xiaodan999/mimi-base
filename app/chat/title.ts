const TITLE_MAX = 24;

/**
 * Conversation title derives from the first user message (ChatGPT-style):
 * first non-empty line, markdown markers stripped, bounded length. No extra
 * AI request — the title is cheap and deterministic, and can be renamed.
 */
export function deriveConversationTitle(text: string, max = TITLE_MAX): string {
    const firstLine =
        text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find((line) => line !== "") ?? "";
    const cleaned = firstLine
        .replace(/^#{1,6}\s+/, "")
        .replace(/^[-*+]\s+/, "")
        .replace(/^>\s+/, "")
        .replace(/[`*_~]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (!cleaned) return "新对话";
    const chars = Array.from(cleaned);
    if (chars.length <= max) return cleaned;
    return `${chars.slice(0, max).join("").trimEnd()}…`;
}
