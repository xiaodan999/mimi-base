import { visionMessage, type AiMessage } from "./client";
import { fenceUntrusted, systemPrompt } from "./prompt-base";

const SYSTEM = systemPrompt(
    "帮朋友配朋友圈文案的搭档",
    "像本人随手发的，不要广告腔，别解释画面里已经很明显的东西。",
);

export type CaptionInput = {
    imageUrls: string[];
    /** 用户已经写下的半句话，作为语气参考 */
    hint?: string;
    layout: "moments" | "instagram" | "twitter";
    count: number;
    /** 视频动态：画面不会发给模型，只按文字写文案。 */
    video?: boolean;
};

const RULES = [
    "给 3 个不同风格的版本，style 分别是：日常、俏皮、文艺。",
    "每个版本不超过 42 个字，可以有一点点情绪，但不要煽情。",
    "不要话题标签，不要引号，不要解释画面里已经很明显的东西。",
    "只输出 JSON：",
    '{"captions":[{"style":"日常","text":"..."},{"style":"俏皮","text":"..."},{"style":"文艺","text":"..."}]}',
].join("\n");

export function captionMessages(input: CaptionInput): AiMessage[] {
    const layoutLabel =
        input.layout === "moments"
            ? "九宫格"
            : input.layout === "instagram"
              ? "大图轮播"
              : "推文样式";
    const context = [
        input.video
            ? `这次要发一条视频动态，排版是${layoutLabel}。视频画面没有提供给你。`
            : `这次要发 ${input.count} 张照片，排版是${layoutLabel}。`,
        // 用户写的半句 / 图片内容都当数据，别让它变成新的指令
        input.hint?.trim()
            ? fenceUntrusted("用户写的半句", input.hint.trim())
            : "",
        input.video
            ? "只根据文字写文案；不要假装看过视频，写得像朋友随手记录这一刻。"
            : "根据照片内容写文案；如果照片信息不足，就像朋友一样泛泛地写这一天的感觉。",
    ]
        .filter(Boolean)
        .join("\n");

    if (input.imageUrls.length > 0) {
        return [
            { role: "system", content: SYSTEM },
            visionMessage(`${context}\n\n${RULES}`, input.imageUrls),
        ];
    }

    return [
        { role: "system", content: SYSTEM },
        {
            role: "user",
            content: `${context}\n\n${
                input.video ? "没有视频画面" : "没有照片"
            }，只根据这句话往下写。\n${RULES}`,
        },
    ];
}
