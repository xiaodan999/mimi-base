import { visionMessage, type AiMessage } from "./client";

const SYSTEM =
    "你是「秘密基地」的记账助手。用户会用一句口语描述花了什么钱，也可能拍一张小票。你的任务是拆成一条条账目。用中文，不要寒暄，不要解释。";

export type CategoryOption = { value: string; label: string };

export type ParsedExpense = {
    name: string;
    price: number;
    category: string;
};

function categoryLine(categories: CategoryOption[]): string {
    return categories.map((item) => `${item.value}=${item.label}`).join("、");
}

function parseRules(categories: CategoryOption[]): string {
    return [
        "只输出一个 JSON 对象，格式：",
        '{"items":[{"name":"午饭","price":25,"category":"food"}]}',
        `category 必须从这些值里选：${categoryLine(categories)}。拿不准就用 other。`,
        "price 是人民币数字，不要带单位、不要带引号。",
        "一句话里有多笔就拆成多条；小票只记录实际购买的行，忽略合计、找零和优惠券行。",
        "name 用简短的中文名，不要带时间。",
    ].join("\n");
}

/** 自然语言记账：一句话 → 多笔账目。 */
export function expenseTextMessages(
    text: string,
    categories: CategoryOption[],
): AiMessage[] {
    return [
        { role: "system", content: SYSTEM },
        {
            role: "user",
            content: `${parseRules(categories)}\n\n用户说：${text.trim()}`,
        },
    ];
}

/** 小票拍照记账：图片 + 说明 → 多笔账目。 */
export function expenseReceiptMessages(
    imageUrls: string[],
    categories: CategoryOption[],
    hint?: string,
): AiMessage[] {
    const text = [
        parseRules(categories),
        "这是一张消费小票，请识别其中的商品名、数量和金额。",
        hint?.trim() ? `用户补充：${hint.trim()}` : "",
    ]
        .filter(Boolean)
        .join("\n");

    return [
        { role: "system", content: SYSTEM },
        visionMessage(text, imageUrls),
    ];
}

export type ExpenseReviewInput = {
    rangeLabel: string;
    total: number;
    dailyAverage: number;
    days: number;
    count: number;
    categories: { label: string; total: number; count: number }[];
    topItems: { name: string; price: number }[];
};

function money(value: number): string {
    return `¥${value.toFixed(2)}`;
}

/** 月度点评：只喂聚合结果，不把整本账发出去。 */
export function expenseReviewMessages(input: ExpenseReviewInput): AiMessage[] {
    const categoryText =
        input.categories.length > 0
            ? input.categories
                  .map(
                      (item) =>
                          `- ${item.label}：${money(item.total)}，${item.count} 笔`,
                  )
                  .join("\n")
            : "- 没有分类数据";
    const topText =
        input.topItems.length > 0
            ? input.topItems
                  .map((item) => `- ${item.name}：${money(item.price)}`)
                  .join("\n")
            : "- 没有单笔记录";

    return [
        { role: "system", content: SYSTEM },
        {
            role: "user",
            content: [
                `请点评这段时间的账：${input.rangeLabel}。`,
                `总支出 ${money(input.total)}，共 ${input.count} 笔，覆盖 ${input.days} 天，日均 ${money(input.dailyAverage)}。`,
                "分类小计：",
                categoryText,
                "金额最大的几笔：",
                topText,
                "",
                "要求：",
                "1. 先用一两句话给出整体判断，具体一点，别只说“控制消费”。",
                "2. 指出最值得注意的一到两点（最多两点），可以对比日均或分类占比。",
                "3. 最后给一个这周就能做到的小建议。",
                "4. 不要复述所有数字，不要用表格，控制在 180 字以内。",
                "5. 用朋友聊天的口气，不要自称 AI。",
            ].join("\n"),
        },
    ];
}

export type CategoryGuess = { name: string; category: string };

/** 历史账目补分类：只传项目名，返回 name → category。 */
export function categoryGuessMessages(
    names: string[],
    categories: CategoryOption[],
): AiMessage[] {
    return [
        { role: "system", content: SYSTEM },
        {
            role: "user",
            content: [
                "给下面这些历史账目补分类。只输出 JSON：",
                '{"items":[{"name":"原样返回的项目名","category":"food"}]}',
                `category 必须是：${categoryLine(categories)}。`,
                "必须保留每一条的原始项目名，不要合并，不要新增。",
                "",
                names.map((name, index) => `${index + 1}. ${name}`).join("\n"),
            ].join("\n"),
        },
    ];
}
