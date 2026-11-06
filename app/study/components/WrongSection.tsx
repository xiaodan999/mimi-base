import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";

import AiPanel from "@/app/ai/AiPanel";
import AiVariantSheet from "@/app/ai/AiVariantSheet";
import { hashText } from "@/app/ai/cache";
import { WRONG_CHIPS, diagnoseWrongMessages } from "@/app/ai/prompts";
import { wrongOverviewMessages } from "@/app/ai/study";

import { answerText, daysLeft, shuffle, streakDays } from "../engine";
import { gameForModule } from "../games/registry";
import type { QuizItem } from "../types";
import AiDrillSheet from "./AiDrillSheet";
import QuizRunner from "./QuizRunner";
import { useStudy } from "./StudyContext";

export default function WrongSection() {
    const { subject, progress, update } = useStudy();
    const [session, setSession] = useState<{
        items: QuizItem[];
        track: boolean;
    } | null>(null);
    const [analysis, setAnalysis] = useState<QuizItem | null>(null);
    const [variantSource, setVariantSource] = useState<QuizItem | null>(null);
    const [overviewOpen, setOverviewOpen] = useState(false);
    const [drillOpen, setDrillOpen] = useState(false);

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

    const overviewMessages = useMemo(
        () =>
            wrongOverviewMessages({
                subjectTitle: subject.title,
                streak: streakDays(progress),
                daysLeft: daysLeft(subject.examDate),
                modules: subject.modules.map((mod) => {
                    const cards = subject.cards.filter(
                        (card) => card.m === mod.id,
                    );
                    return {
                        name: mod.name,
                        known: cards.filter(
                            (card) => progress.cards[card.id]?.k,
                        ).length,
                        total: cards.length,
                        wrong: items.filter((item) => item.m === mod.id).length,
                    };
                }),
                wrongItems: items.map((item) => ({
                    moduleName:
                        subject.modules.find((mod) => mod.id === item.m)
                            ?.name ?? item.m,
                    stem: item.stem,
                    answer: answerText(item),
                })),
            }),
        [items, progress, subject],
    );
    const overviewCacheKey = `wrong-overview:v1:${subject.id}:${hashText(
        items.map((item) => item.id).join(","),
    )}`;

    const openAnalysis = (item: QuizItem) => {
        setAnalysis(item);
    };

    const openVariant = (item: QuizItem) => {
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

            <div className="st-row" style={{ gap: 8, marginBottom: 10 }}>
                <button
                    className="st-btn sm line flex-1"
                    onClick={() => {
                        setOverviewOpen(true);
                    }}
                >
                    🧠 AI 归因
                </button>
                <button
                    className="st-btn sm line flex-1"
                    onClick={() => {
                        setDrillOpen(true);
                    }}
                >
                    🎯 AI 挑题
                </button>
            </div>

            {items.map((item) => {
                const game = gameForModule(item.m);
                return (
                    <div className="st-card" key={item.id}>
                        <div
                            className="st-row"
                            style={{ gap: 6, marginBottom: 6 }}
                        >
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
                                {
                                    subject.modules.find((m) => m.id === item.m)
                                        ?.name
                                }
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
                            {game && (
                                <Link
                                    to="/study/$subjectId/$section"
                                    params={{
                                        subjectId: subject.id,
                                        section: "games",
                                    }}
                                    search={{ game: game.id }}
                                    className="st-btn sm line"
                                >
                                    🎮 去实战：{game.title}
                                </Link>
                            )}
                        </div>
                    </div>
                );
            })}

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

            <AiPanel
                open={overviewOpen}
                onClose={() => setOverviewOpen(false)}
                title="错题归因"
                subtitle={`${items.length} 道错题 · 找共同误解`}
                cacheKey={overviewCacheKey}
                messages={overviewMessages}
                chips={WRONG_CHIPS}
                intro="AI 不会逐题重讲，只找这批错题背后的共同问题。"
            />

            <AiDrillSheet
                open={drillOpen}
                onClose={() => setDrillOpen(false)}
                onStart={(next) => setSession({ items: next, track: false })}
            />
        </div>
    );
}
