import type { ChatMessage } from "./types";

/**
 * Tool result written onto the calls a page kill (Android backgrounding a
 * frozen tab, a crash, a reload) interrupted mid-execution. The mount scan in
 * `-use-chat-session.ts` marks them so the cards stop spinning forever; the
 * resume path keeps them in history so the model reads the failure and
 * carries on instead of re-executing code.
 */
export const INTERRUPTED_TOOL_ERROR = "页面刷新中断了这次执行";

export type InterruptedRun = {
    /**
     * `no-reply`: the reply never reached the database (killed while the
     * first round was still streaming) — history ends on the user message.
     * `tools`: the loop died around a tool round — the persisted history is
     * complete up to that round and the model owes a follow-up.
     */
    kind: "no-reply" | "tools";
    /** Message the resume anchors on (re-run after it / continue after it). */
    anchorId: string;
};

/**
 * Detect a run a page kill left unfinished, from persisted rows only.
 *
 * The tool loop always ends on a round without tool calls (see
 * `MAX_TOOL_ROUNDS` in `-use-chat-session.ts`), so a *complete* last
 * assistant row that still carries tool-call parts means the loop never got
 * to write its follow-up. Explicit stops (`status: "stopped"`) and stream
 * errors (`status: "error"`) are deliberate or already surfaced by the
 * thread's 重新生成 button, so they are not interruptions.
 */
export function detectInterruptedRun(
    messages: readonly ChatMessage[],
): InterruptedRun | null {
    const last = messages.at(-1);
    if (!last) return null;
    if (last.role === "user") {
        return { kind: "no-reply", anchorId: last.id };
    }
    if (last.status !== "complete") return null;
    const hasToolCall = last.parts.some((part) => part.type === "tool-call");
    if (!hasToolCall) return null;
    return { kind: "tools", anchorId: last.id };
}
