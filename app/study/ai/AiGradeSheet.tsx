import { useCallback, useEffect, useRef, useState } from "react";

import { TYPE_NAME } from "../engine";
import { toast } from "../toast";
import type { Answer, QuizItem, StudySubject } from "../types";
import { useAi } from "./AiContext";
import AiMarkdown from "./AiMarkdown";
import AiSheet from "./AiSheet";
import { hashText, readAiCache, writeAiCache } from "./cache";
import { aiErrorText, chatJSON } from "./client";
import { gradeMessages, userAnswerText, type AiGrade } from "./prompts";

type Props = {
    open: boolean;
    onClose: () => void;
    subject: StudySubject;
    item: QuizItem | null;
    answer: Answer;
    moduleName?: string;
    onAdopt?: (score: 0 | 0.5 | 1) => void;
};

function normalize(raw: AiGrade | null | undefined): AiGrade {
    const value = (raw ?? {}) as Partial<AiGrade>;
    const list = (input: unknown): string[] =>
        Array.isArray(input)
            ? input
                  .filter(
                      (entry): entry is string =>
                          typeof entry === "string" && entry.trim().length > 0,
                  )
                  .slice(0, 8)
            : [];
    return {
        score: Math.max(0, Math.min(100, Math.round(Number(value.score) || 0))),
        hit: list(value.hit),
        miss: list(value.miss),
        comment: typeof value.comment === "string" ? value.comment : "",
        modelAnswer:
            typeof value.modelAnswer === "string" ? value.modelAnswer : "",
    };
}

export default function AiGradeSheet({
    open,
    onClose,
    subject,
    item,
    answer,
    moduleName,
    onAdopt,
}: Props) {
    const { settings, configured, openSettings } = useAi();
    const [grade, setGrade] = useState<AiGrade | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const abortRef = useRef<AbortController | null>(null);
    const startedRef = useRef<string | null>(null);

    const cacheKey = item
        ? `grade:${item.id}:${hashText(userAnswerText(item, answer))}`
        : "";

    const run = useCallback(async () => {
        if (!item) return;
        if (!configured) {
            setError("先配置 AI Key");
            openSettings();
            return;
        }
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setLoading(true);
        setError("");
        setGrade(null);
        try {
            const raw = await chatJSON<AiGrade>(
                settings,
                gradeMessages(subject, item, answer, moduleName),
                controller.signal,
            );
            if (controller.signal.aborted) return;
            const next = normalize(raw);
            setGrade(next);
            writeAiCache(cacheKey, next);
        } catch (err) {
            if (controller.signal.aborted) return;
            setError(aiErrorText(err));
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            setLoading(false);
        }
    }, [
        answer,
        cacheKey,
        configured,
        item,
        moduleName,
        openSettings,
        settings,
        subject,
    ]);

    useEffect(() => {
        if (!open || !item) {
            startedRef.current = null;
            abortRef.current?.abort();
            return;
        }
        if (startedRef.current === cacheKey) return;
        startedRef.current = cacheKey;

        const cached = readAiCache<AiGrade>(cacheKey);
        if (cached) {
            setGrade(cached);
            setError("");
            setLoading(false);
            return;
        }
        setGrade(null);
        void run();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, cacheKey]);

    useEffect(() => () => abortRef.current?.abort(), []);

    const adopt = () => {
        if (!grade || !onAdopt) return;
        const score: 0 | 0.5 | 1 =
            grade.score >= 80 ? 1 : grade.score >= 50 ? 0.5 : 0;
        onAdopt(score);
        toast(`已按 AI 评分记入：${grade.score} 分`);
        onClose();
    };

    const color =
        grade && grade.score >= 80
            ? "var(--ok)"
            : grade && grade.score >= 60
              ? "var(--warn)"
              : "var(--no)";

    return (
        <AiSheet
            open={open}
            onClose={onClose}
            title="AI 批改"
            subtitle={
                item
                    ? `${TYPE_NAME[item.type]} · ${moduleName ?? item.m}`
                    : undefined
            }
        >
            {loading && (
                <div className="space-y-2">
                    <div className="st-tiny">AI 正在按踩分点批改…</div>
                    <div className="ai-skeleton w-2/3" />
                    <div className="ai-skeleton w-full" />
                    <div className="ai-skeleton w-5/6" />
                </div>
            )}

            {error && (
                <div className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-6 text-amber-800">
                    {error}
                    <div className="mt-2 flex flex-wrap gap-2">
                        <button className="st-btn sm line" onClick={run}>
                            重试
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

            {grade && !loading && (
                <>
                    <div className="flex items-end gap-3">
                        <div className="ai-score" style={{ color }}>
                            {grade.score}
                        </div>
                        <div className="st-tiny pb-1">
                            / 100 ·{" "}
                            {grade.score >= 80
                                ? "答得很稳"
                                : grade.score >= 60
                                  ? "踩到大部分点"
                                  : "还差一些得分点"}
                        </div>
                    </div>

                    <div className="mt-3">
                        <div className="st-tiny font-bold">踩到的点</div>
                        <div className="kws">
                            {grade.hit.length ? (
                                grade.hit.map((key) => (
                                    <span className="st-chip g" key={key}>
                                        {key}
                                    </span>
                                ))
                            ) : (
                                <span className="st-tiny">还没有明显踩到</span>
                            )}
                        </div>
                    </div>

                    <div className="mt-2">
                        <div className="st-tiny font-bold">漏掉的点</div>
                        <div className="kws">
                            {grade.miss.length ? (
                                grade.miss.map((key) => (
                                    <span className="st-chip r" key={key}>
                                        {key}
                                    </span>
                                ))
                            ) : (
                                <span className="st-tiny">没有明显遗漏</span>
                            )}
                        </div>
                    </div>

                    {grade.comment && (
                        <div
                            className="st-card mt-3"
                            style={{ marginBottom: 0 }}
                        >
                            <div className="st-tiny font-bold">点评</div>
                            <div className="mt-1 text-[13.5px] leading-7">
                                {grade.comment}
                            </div>
                        </div>
                    )}

                    {grade.modelAnswer && (
                        <div className="refbox">
                            <div className="rt">满分参考答案</div>
                            <AiMarkdown text={grade.modelAnswer} />
                        </div>
                    )}

                    <div className="st-row mt-3 flex-wrap" style={{ gap: 8 }}>
                        <button className="st-btn sm ghost" onClick={run}>
                            重新批改
                        </button>
                        {onAdopt && (
                            <button className="st-btn sm line" onClick={adopt}>
                                采纳 AI 评分
                            </button>
                        )}
                    </div>

                    <div className="st-tiny mt-2">
                        AI 评分只作参考，最终以考试踩分点为准。
                    </div>
                </>
            )}
        </AiSheet>
    );
}
