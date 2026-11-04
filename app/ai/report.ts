import type { AiMessage } from "./client";

const SYSTEM =
    "你在「秘密基地」里帮用户写年度总结。中文，像老朋友说话，具体、温和，不要模板腔，不要自称 AI，不要用“时光荏苒”这类词。";

export type ReportLetterInput = {
    year: number;
    posts: number;
    photos: number;
    spend: number;
    entries: number;
    topCategory: string;
    topCategoryShare: number;
    questions: number;
    correct: number;
    streak: number;
    xp: number;
};

export function reportLetterMessages(input: ReportLetterInput): AiMessage[] {
    const accuracy =
        input.questions > 0
            ? Math.round((input.correct / input.questions) * 100)
            : 0;

    return [
        { role: "system", content: SYSTEM },
        {
            role: "user",
            content: [
                `这是 ${input.year} 年的个人数据：`,
                `- 动态 ${input.posts} 条，照片 ${input.photos} 张`,
                `- 支出 ¥${input.spend.toFixed(2)}，共 ${input.entries} 笔`,
                input.entries > 0
                    ? `- 花得最多的是${input.topCategory}，占 ${Math.round(input.topCategoryShare * 100)}%`
                    : "- 没有记账数据",
                `- 做题 ${input.questions} 道，正确率 ${accuracy}%，连续学习 ${input.streak} 天，经验值 ${input.xp}`,
                "",
                "写一封 220 字以内的年度小结：",
                "1. 先讲这一年记录下来的生活，挑一两个具体数字来说，别报流水账。",
                "2. 再说学习或记账里一个值得被看见的坚持。",
                "3. 最后用一句不油腻的祝福收尾。",
                "不要分点，不要用表格，不要编造数据里没有的事。",
            ].join("\n"),
        },
    ];
}
