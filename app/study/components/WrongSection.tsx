import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";

import { useAi } from "../ai/AiContext";
import AiPanel from "../ai/AiPanel";
import AiVariantSheet from "../ai/AiVariantSheet";
import { WRONG_CHIPS, diagnoseWrongMessages } from "../ai/prompts";
import { answerText, shuffle } from "../engine";
import { toast } from "../toast";
import type { QuizItem } from "../types";
import QuizRunner from "./QuizRunner";
import { useStudy } from "./StudyContext";

export default function WrongSection() {
    const { subject, progress, update } = useStudy();
    const { configured, openSettings } = useAi();
    const [session, setSession] = useState<{
        items: QuizItem[];
        track: boolean;
    } | null>(null);
    const [analysis, setAnalysis] = useState<QuizItem | null>(null);
    const [variantSource, setVariantSource] = useState<QuizItem | null>(null);

    const items = Object.keys(progress.wrong)
        .map((id) => subject.bank.find((item) => item.id === id))
        .filter((item): item is QuizItem => Boolean(item))
        .sort(
            (a, b) =>
                (progress.wrong[b.id]?.t ?? 0) - (progress.wrong[a.id]?.t ?? 0),
        );

    const analysisModule = analysis
        ? subject.modules.find((mod) => mod.id === analysis.m)?.name
        : undefined;
    const analysisMessages = useMemo(
        () =>
            analysis
                ? diagnoseWrongMessages(
                      subject,
                      analysis,
                      undefined,
                      analysisModule,
                  )
                : [],
        [analysis, analysisModule, subject],
    );
    const variantModule = variantSource
        ? subject.modules.find((mod) => mod.id === variantSource.m)?.name
        : undefined;

    const openAnalysis = (item: QuizItem) => {
        if (!configured) {
            openSettings();
            toast("先配置一下 AI Key");
            return;
        }
        setAnalysis(item);
    };

    const openVariant = (item: QuizItem) => {
        if (!configured) {
            openSettings();
            toast("先配置一下 AI Key");
            return;
        }
        setVariantSource(item);
    };

    if (session) {
        return (
            <QuizRunner
                items={session.items}
                mode="wrong"
                onExit={() => setSession(null)}
                track={session.track}
            />
        );
    }

    if (!items.length) {
        return (
            <div className="st-empty">
                <div className="ei">🎯</div>
                <div className="text-[15px] font-extrabold">错题本是空的</div>
                <div className="st-tiny mt-2">
                    做错的题会自动收进来，答对后自动移出
                </div>
                <Link
                    to="/study/$subjectId/$section"
                    params={{ subjectId: subject.id, section: "quiz" }}
                    className="st-btn mt-4"
                >
                    去刷题
                </Link>
            </div>
        );
    }

    return (
        <div>
            <div className="st-between" style={{ marginBottom: 10 }}>
                <span className="st-chip r">{items.length} 道待复习</span>
                <button
                    className="st-btn sm line"
                    onClick={() =>
                        setSession({ items: shuffle(items), track: true })
                    }
                >
                    全部重练
                </button>
            </div>

            {items.map((item) => (
                <div className="st-card" key={item.id}>
                    <div className="st-row" style={{ gap: 6, marginBottom: 6 }}>
                        <span className="st-chip">
                            {
                                {
                                    term: "名词解释",
                                    single: "单选题",
                                    multi: "多选题",
                                    blank: "填空题",
                                    short: "简答题",
                                }[item.type]
                            }
                        </span>
                        <span className="st-chip">
                            {subject.modules.find((m) => m.id === item.m)?.name}
                        </span>
                        <span className="st-chip r">
                            错 {progress.wrong[item.id]?.c ?? 1} 次
                        </span>
                    </div>
                    <div className="review-q">{item.stem}</div>
                    <div className="review-a">
                        <b>答案：</b>
                        {answerText(item)}
                        <br />
                        {item.exp ?? ""}
                    </div>
                    <div
                        className="st-row mt-2"
                        style={{ gap: 8, flexWrap: "wrap" }}
                    >
                        <button
                            className="st-btn sm ghost"
                            onClick={() =>
                                setSession({ items: [item], track: true })
                            }
                        >
                            重做这题
                        </button>
                        <button
                            className="st-btn sm line"
                            onClick={() => openAnalysis(item)}
                        >
                            🔬 AI 验尸
                        </button>
                        <button
                            className="st-btn sm line"
                            onClick={() => openVariant(item)}
                        >
                            🧬 变式题
                        </button>
                    </div>
                </div>
            ))}

            <button
                className="st-btn ghost mt-4 block"
                onClick={() => {
                    if (window.confirm("确定清空错题本吗？")) {
                        update((current) => ({ ...current, wrong: {} }));
                    }
                }}
            >
                清空错题本
            </button>

            <AiPanel
                open={Boolean(analysis)}
                onClose={() => setAnalysis(null)}
                title="错题验尸"
                subtitle={analysisModule}
                cacheKey={analysis ? `wrong:${analysis.id}` : "wrong:none"}
                messages={analysisMessages}
                chips={WRONG_CHIPS}
                intro="没留下当时的答案也没关系，AI 会分析这道题最常见的误解。"
            />

            <AiVariantSheet
                open={Boolean(variantSource)}
                onClose={() => setVariantSource(null)}
                subject={subject}
                source={variantSource}
                moduleName={variantModule}
                onStart={(next) => {
                    setVariantSource(null);
                    setSession({ items: next, track: false });
                }}
            />
        </div>
    );
}
