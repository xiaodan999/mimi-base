import { AiError, chatText, streamChat } from "./client";
import type { AiSettings } from "./config";
import { readAiSettings } from "./config";
import type { ResumePayload } from "./interrupted";
import type { AiTaskRunContext } from "./task-store";

/**
 * 被中断任务的通用续跑：把台账里存的 prompt 原样重发一遍。
 * 只覆盖 stream / text 任务 —— 它们的结果是字符串（或 AiPanel 的 turns），
 * 不需要任何功能侧的收尾逻辑。json 任务的结果各有各的解析和上下文，
 * 不在这里续跑，恢复后回原页面重发更可靠。
 */
export function createResumeRun(
    payload: ResumePayload,
    kind: "stream" | "text",
): (context: AiTaskRunContext) => Promise<unknown> {
    return async ({ signal, report }: AiTaskRunContext) => {
        const settings: AiSettings = readAiSettings();
        const options = {
            maxTokens: payload.maxTokens,
            temperature: payload.temperature,
        };

        let text = "";
        if (kind === "stream") {
            for await (const delta of streamChat(
                settings,
                payload.messages,
                signal,
                options,
            )) {
                text += delta;
                report(text);
            }
        } else {
            text = (
                await chatText(settings, payload.messages, signal, options)
            ).trim();
        }
        if (text === "") {
            throw new AiError("AI 没有返回内容，再试一次吧");
        }
        return payload.history
            ? [
                  ...payload.history,
                  { role: "assistant" as const, content: text },
              ]
            : text;
    };
}
