import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

import { TYPE_ICON, TYPE_NAME, shuffle } from "../engine";
import type { QuizItem, QuizType } from "../types";
import QuizRunner from "./QuizRunner";
import { useStudy } from "./StudyContext";

type Session = {
    items: QuizItem[];
    mode: "practice" | "wrong";
    title: string;
};

const TYPES: QuizType[] = ["term", "single", "multi", "blank", "short"];

export default function QuizSection({ quick }: { quick?: boolean }) {
    const { subject, progress } = useStudy();
    const [session, setSession] = useState<Session | null>(null);
    const [autoStarted, setAutoStarted] = useState(false);

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

    useEffect(() => {
        if (!quick || autoStarted) return;
        setAutoStarted(true);
        startQuick();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quick, autoStarted]);

    if (session) {
        return (
            <QuizRunner
                items={session.items}
                mode={session.mode}
                onExit={() => setSession(null)}
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
            </div>
        </div>
    );
}
