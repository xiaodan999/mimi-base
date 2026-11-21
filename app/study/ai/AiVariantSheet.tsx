import { useAi } from "@/app/ai/AiContext";
import AiSheet from "@/app/ai/AiSheet";
import { AiError, chatJSON } from "@/app/ai/client";
import { useAiFeature } from "@/app/ai/use-ai-feature";
import type { QuizItem, StudySubject } from "@/app/study/types";
import { toast } from "@/lib/toast";

import { type AiVariantPayload, variantMessages } from "./prompts";

type Props = {
    open: boolean;
    onClose: () => void;
    subject: StudySubject;
    source: QuizItem | null;
    moduleName?: string;
    onStart: (items: QuizItem[]) => void;
};

function toIndex(value: unknown): number {
    if (typeof value === "number" && Number.isInteger(value)) return value;
    if (typeof value === "string") {
        const trimmed = value.trim().toUpperCase();
        if (/^[A-F]$/.test(trimmed)) return trimmed.charCodeAt(0) - 65;
        const parsed = Number(trimmed);
        if (Number.isInteger(parsed)) return parsed;
    }
    return -1;
}

function cleanOption(value: unknown): string {
    return String(value ?? "")
        .replace(/^[A-F][.、)]\s*/, "")
        .trim();
}

function toQuizItems(
    payload: AiVariantPayload | null | undefined,
    source: QuizItem,
): QuizItem[] {
    const items: QuizItem[] = [];
    const stamp = Date.now();

    (payload?.items ?? []).forEach((raw, index) => {
        if (!raw || typeof raw.stem !== "string" || !raw.stem.trim()) return;
        if (!Array.isArray(raw.options)) return;
        const options = raw.options
            .map(cleanOption)
            .filter(Boolean)
            .slice(0, 6);
        if (options.length < 2) return;
        const exp = typeof raw.exp === "string" ? raw.exp : "";
        const stem = raw.stem.trim();

        if (raw.type === "single") {
            const a = toIndex(raw.answer);
            if (a < 0 || a >= options.length) return;
            items.push({
                id: `ai-${stamp}-${index}`,
                m: source.m,
                type: "single",
                stem,
                o: options,
                a,
                exp,
            });
            return;
        }

        if (raw.type === "multi") {
            const list = (Array.isArray(raw.answer) ? raw.answer : [raw.answer])
                .map(toIndex)
                .filter((value) => value >= 0 && value < options.length);
            const a = [...new Set(list)];
            if (!a.length) return;
            items.push({
                id: `ai-${stamp}-${index}`,
                m: source.m,
                type: "multi",
                stem,
                o: options,
                a,
                exp,
            });
        }
    });

    return items.slice(0, 4);
}

export default function AiVariantSheet({
    open,
    onClose,
    subject,
    source,
    moduleName,
    onStart,
}: Props) {
    const { settings, openSettings } = useAi();

    const cacheKey = source ? `variant:v1:${source.id}` : "";

    const feature = useAiFeature<AiVariantPayload>({
        key: cacheKey,
        title: "AI 变式题",
        subtitle: source ? `基于：${source.stem.slice(0, 34)}` : undefined,
        href: "/study",
        kind: "json",
        enabled: open && Boolean(source),
        hasValue: (value) =>
            source ? toQuizItems(value, source).length > 0 : false,
        summarize: (value) =>
            `生成了 ${source ? toQuizItems(value, source).length : 0} 道变式题`,
        run: async ({ signal }) => {
            if (!source) throw new AiError("没有题目");
            const result = await chatJSON<AiVariantPayload>(
                settings,
                variantMessages(subject, source, moduleName),
                signal,
            );
            if (!toQuizItems(result, source).length) {
                throw new AiError("AI 出的题格式不对，换一批试试");
            }
            return result;
        },
    });
    const loading = feature.running;
    const error = feature.error;
    const items =
        source && feature.value ? toQuizItems(feature.value, source) : [];

    return (
        <AiSheet
            open={open}
            onClose={onClose}
            title="AI 变式题"
            subtitle={source ? `基于：${source.stem.slice(0, 34)}` : undefined}
        >
            {loading && (
                <div className="space-y-2">
                    <div className="st-tiny">
                        AI 正在换 3 种问法，找同一个考点的坑…
                    </div>
                    <div className="ai-skeleton w-3/4" />
                    <div className="ai-skeleton w-full" />
                    <div className="ai-skeleton w-2/3" />
                </div>
            )}

            {error && (
                <div className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-6 text-amber-800">
                    {error}
                    <div className="mt-2 flex flex-wrap gap-2">
                        <button
                            className="st-btn sm line"
                            onClick={() => void feature.start({ force: true })}
                        >
                            换一批
                        </button>
                        <button
                            className="st-btn sm ghost"
                            onClick={openSettings}
                        >
                            打开设置
                        </button>
                    </div>
                </div>
            )}

            {!loading && !error && items.length > 0 && (
                <>
                    <div className="st-tiny mb-2">
                        AI 生成了 {items.length}{" "}
                        道同考点变式题，先自己选，做完自动判分。
                    </div>
                    {items.map((item, index) => (
                        <div className="st-card" key={item.id}>
                            <div className="st-row" style={{ gap: 6 }}>
                                <span className="st-chip b">
                                    {item.type === "single" ? "单选" : "多选"}
                                </span>
                                <span className="st-chip">
                                    {moduleName ?? item.m}
                                </span>
                            </div>
                            <div className="mt-2 text-[14px] leading-6 font-bold">
                                {index + 1}. {item.stem}
                            </div>
                            <div className="mt-2 space-y-1">
                                {"o" in item &&
                                    item.o.map((option, optionIndex) => (
                                        <div
                                            key={optionIndex}
                                            className="text-[13px] text-muted-foreground"
                                        >
                                            {String.fromCharCode(
                                                65 + optionIndex,
                                            )}
                                            . {option}
                                        </div>
                                    ))}
                            </div>
                        </div>
                    ))}

                    <div className="st-row mt-3" style={{ gap: 8 }}>
                        <button
                            className="st-btn sm ghost"
                            onClick={() => void feature.start({ force: true })}
                        >
                            换一批
                        </button>
                        <button
                            className="st-btn"
                            style={{ flex: 1 }}
                            onClick={() => {
                                onStart(items);
                                toast("开始做 AI 变式题");
                            }}
                        >
                            开始做这 {items.length} 题
                        </button>
                    </div>
                </>
            )}
        </AiSheet>
    );
}
