import { z } from "zod";

import type { AiMessage } from "@/app/ai/client";
import { fenceUntrusted, systemPrompt } from "@/app/ai/prompt-base";

import { MAX_FEEDBACK_DESCRIPTION, MAX_FEEDBACK_TITLE } from "./validation";

const SYSTEM = systemPrompt(
    "帮朋友整理 bug 反馈的助手",
    "把零散描述改写成开发者能直接复现的问题报告，不编造用户没提供的操作或环境。",
);

export const FEEDBACK_POLISH_SCHEMA = z.object({
    title: z.string(),
    description: z.string(),
});

export type FeedbackPolishInput = {
    title: string;
    description: string;
    route: string;
    errors: string[];
};

const RULES = [
    "标题不超过 30 个字，说清「在哪个页面发生了什么」。",
    "描述分三小段：现象、复现步骤（用户提到才写）、期望结果。",
    "只使用用户提供的信息和下面的页面/报错上下文，不要编造设备、账号或时间。",
    "语气直接、克制，不写客套话，不要 Markdown 标题。",
    "只输出 JSON：",
    '{"title":"...","description":"..."}',
].join("\n");

export function feedbackPolishMessages(
    input: FeedbackPolishInput,
): AiMessage[] {
    const errors = input.errors.filter(Boolean).slice(0, 8).join("\n");
    const context = [
        `出问题的页面：${input.route || "未知"}`,
        fenceUntrusted("用户写的标题", input.title.trim() || "（还没写标题）"),
        fenceUntrusted(
            "用户写的描述",
            input.description.trim() || "（还没写描述）",
        ),
        errors ? fenceUntrusted("最近捕获的报错", errors) : "",
        "整理成一条可以直接提交的 bug 反馈。",
        RULES,
    ]
        .filter(Boolean)
        .join("\n\n");

    return [
        { role: "system", content: SYSTEM },
        { role: "user", content: context },
    ];
}

/** Trim/limit the model's answer so it still fits the form and the schema. */
export function sanitizePolishedFeedback(value: {
    title: unknown;
    description: unknown;
}): { title: string; description: string } | null {
    const title =
        typeof value.title === "string"
            ? value.title.trim().slice(0, MAX_FEEDBACK_TITLE)
            : "";
    const description =
        typeof value.description === "string"
            ? value.description.trim().slice(0, MAX_FEEDBACK_DESCRIPTION)
            : "";
    if (!title || !description) return null;
    return { title, description };
}
