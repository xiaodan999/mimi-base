import type { AiMessage } from "./client";

const SYSTEM =
    "你是「秘密基地」的管家。中文，口语化，简短，像熟人说话，不要自称 AI，不要客服腔。";

export type DailyLineInput = {
    greeting: string;
    postsToday: number;
    monthSpend: number;
    monthEntries: number;
    streak: number;
};

/** 首页问候语下面那一行：每天最多生成一次。 */
export function dailyLineMessages(input: DailyLineInput): AiMessage[] {
    const facts = [
        `今天已经发了 ${input.postsToday} 条动态`,
        `本月花了 ¥${input.monthSpend.toFixed(2)}，共 ${input.monthEntries} 笔`,
        `连续学习 ${input.streak} 天`,
    ].join("；");

    return [
        { role: "system", content: SYSTEM },
        {
            role: "user",
            content: [
                `现在是${input.greeting}。根据这些数据，写一句给用户看的今日小结：${facts}。`,
                "要求：一句话，不超过 34 个字；只提最值得说的一两件事；没有数据就轻轻提一句记录；",
                "不要列数字清单，不要用感叹号，不要问问题，不要加引号。",
            ].join("\n"),
        },
    ];
}

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
                texts,
                "",
                "写一句旁白，帮现在的用户回忆一下那天。",
                "要求：不超过 32 个字；温柔但别煽情；不要用“时光”“岁月”这类词；不要复述原文。",
            ].join("\n"),
        },
    ];
}

export type AskInput = {
    question: string;
    context: string;
};

/** 问问我的基地：只根据本地取到的数据回答。 */
export function askMessages(input: AskInput): AiMessage[] {
    return [
        {
            role: "system",
            content: [
                SYSTEM,
                "你只能根据下面「用户数据」里的内容回答。",
                "数据里没有的信息，直接说没记到，不要编。",
                "涉及金额时把计算过程算准；回答控制在 150 字以内。",
            ].join("\n"),
        },
        {
            role: "user",
            content: [
                "用户数据：",
                input.context || "（暂时没有数据）",
                "",
                `问题：${input.question}`,
            ].join("\n"),
        },
    ];
}
