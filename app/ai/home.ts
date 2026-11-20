import type { AiMessage } from "./client";
import { fenceUntrusted, systemPrompt } from "./prompt-base";

const SYSTEM = systemPrompt("管家", "简短，别寒暄。");

export type MemoryInput = {
    dateLabel: string;
    texts: { yearsAgo: number; text: string }[];
};

/** 「去年今天」卡片上的一句旁白。 */
export function memoryMessages(input: MemoryInput): AiMessage[] {
    const texts = input.texts
        .map((item) => `- ${item.yearsAgo} 年前：${item.text.slice(0, 120)}`)
        .join("\n");

    return [
        { role: "system", content: SYSTEM },
        {
            role: "user",
            content: [
                `${input.dateLabel}前后，用户在这些年的同一天发过这些动态：`,
                // 动态正文是用户内容，当数据包裹，别让它变成指令
                fenceUntrusted("往年动态", texts),
                "",
                "写一句旁白，帮现在的用户回忆一下那天。",
                "要求：不超过 32 个字；温柔但别煽情；不要用“时光”“岁月”这类词；不要复述原文。",
            ].join("\n"),
        },
    ];
}
