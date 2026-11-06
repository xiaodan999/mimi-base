import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

import AiVariantSheet from "@/app/ai/AiVariantSheet";

import { TYPE_ICON, TYPE_NAME, shuffle } from "../engine";
import { dueCount, dueQueue } from "../scheduling";
import { toast } from "../toast";
import type { QuizItem, QuizType } from "../types";
import QuizRunner from "./QuizRunner";
import { useStudy } from "./StudyContext";

type Session = {
    items: QuizItem[];
    mode: "practice" | "wrong";
    title: string;
    track?: boolean;
};

const TYPES: QuizType[] = ["term", "single", "multi", "blank", "short"];

export default function QuizSection({ quick }: { quick?: boolean }) {
    const { subject, progress } = useStudy();
    const [session, setSession] = useState<Session | null>(null);
    const [autoStarted, setAutoStarted] = useState(false);
    const [variantSource, setVariantSource] = useState<QuizItem | null>(null);

    const startType = (type: QuizType) => {
        const pool = shuffle(subject.bank.filter((q) => q.type === type));
        if (!pool.length) return;
        setSession({ items: pool, mode: "practice", title: TYPE_NAME[type] });
    };

    const startQuick = () => {
        const pool = shuffle(
            subject.bank.filter((q) =>
                ["single", "multi", "blank"].includes(q.type),
            ),
        ).slice(0, 10);
        if (!pool.length) return;
        setSession({ items: pool, mode: "practice", title: "5 分钟快刷" });
    };

    // 按遗忘曲线挑题：已到期（或新题）优先，越早逾期越靠前。
    const reviewCount = dueCount(subject.bank, progress.srs);
    const startReview = () => {
        const items = dueQueue(subject.bank, progress.srs);
        if (!items.length) return;
        setSession({ items, mode: "practice", title: "智能复习" });
    };

    useEffect(() => {
        if (!quick || autoStarted) return;
        setAutoStarted(true);
        startQuick();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quick, autoStarted]);

    const startAiVariant = () => {
        const wrong = Object.keys(progress.wrong)
            .map((id) => subject.bank.find((item) => item.id === id))
            .filter((item): item is QuizItem => Boolean(item));
        const pool = wrong.length
            ? wrong
            : subject.bank.filter(
                  (item) => item.type === "single" || item.type === "multi",
              );
        const source = shuffle(pool)[0];
        if (!source) {
            toast("题库里还没有可以出变式的题");
            return;
        }
        setVariantSource(source);
    };

    const variantModule = variantSource
        ? subject.modules.find((mod) => mod.id === variantSource.m)?.name
        : undefined;

    if (session) {
        return (
            <QuizRunner
                items={session.items}
                mode={session.mode}
                onExit={() => setSession(null)}
                track={session.track ?? true}
            />
        );
    }

    const wrongCount = Object.keys(progress.wrong).length;

    return (
        <div>
            <div className="st-sec" style={{ marginTop: 4 }}>
                按题型练习
            </div>
            <div className="mod-grid">
                {TYPES.map((type) => {
                    const all = subject.bank.filter((q) => q.type === type);
                    const done = all.filter((q) => progress.stat[q.id]).length;
                    const percent = all.length
                        ? Math.round((done / all.length) * 100)
                        : 0;
                    return (
                        <button
                            key={type}
                            className="mod"
                            style={
                                {
                                    "--mc": "var(--brand)",
                                    textAlign: "left",
                                } as React.CSSProperties
                            }
                            onClick={() => startType(type)}
                        >
                            <div className="mod-ic">{TYPE_ICON[type]}</div>
                            <div className="mod-t">{TYPE_NAME[type]}</div>
                            <div className="mod-s">
                                共 {all.length} 题 · 已练 {done} 题
                            </div>
                            <div className="mod-ring">{percent}%</div>
                        </button>
                    );
                })}
            </div>

            <div className="st-sec">强化训练</div>
            <div className="mod-grid">
                <button className="mod" onClick={startReview}>
                    <div className="mod-ic">⏰</div>
                    <div className="mod-t">智能复习</div>
                    <div className="mod-s">
                        {reviewCount
                            ? `按遗忘曲线 · ${reviewCount} 道待复习`
                            : "今天暂时没有到期的题"}
                    </div>
                    <div className="mod-ring">{reviewCount}</div>
                </button>
                <button className="mod" onClick={startQuick}>
                    <div className="mod-ic">🎯</div>
                    <div className="mod-t">5 分钟快刷</div>
                    <div className="mod-s">随机 10 道混合题</div>
                </button>
                <Link
                    to="/study/$subjectId/$section"
                    params={{ subjectId: subject.id, section: "wrong" }}
                    className="mod"
                    style={{ "--mc": "var(--no)" } as React.CSSProperties}
                >
                    <div className="mod-ic">🔁</div>
                    <div className="mod-t">错题本</div>
                    <div className="mod-s">
                        {wrongCount ? `${wrongCount} 道待复习` : "暂无错题"}
                    </div>
                    <div className="mod-ring">{wrongCount}</div>
                </Link>
                <Link
                    to="/study/$subjectId/$section"
                    params={{ subjectId: subject.id, section: "exam" }}
                    className="mod"
                    style={{ "--mc": "var(--m5)" } as React.CSSProperties}
                >
                    <div className="mod-ic">⏱️</div>
                    <div className="mod-t">模拟考</div>
                    <div className="mod-s">计时 · 交卷评分 · 逐题解析</div>
                </Link>
                <button
                    className="mod"
                    style={{ "--mc": "var(--m3)" } as React.CSSProperties}
                    onClick={startAiVariant}
                >
                    <div className="mod-ic">🧬</div>
                    <div className="mod-t">AI 变式题</div>
                    <div className="mod-s">拿一道错题，换 3 种问法</div>
                    <div className="mod-ring">AI</div>
                </button>
            </div>

            <AiVariantSheet
                open={Boolean(variantSource)}
                onClose={() => setVariantSource(null)}
                subject={subject}
                source={variantSource}
                moduleName={variantModule}
                onStart={(items) => {
                    setVariantSource(null);
                    setSession({
                        items,
                        mode: "practice",
                        title: "AI 变式题",
                        track: false,
                    });
                }}
            />
        </div>
    );
}
