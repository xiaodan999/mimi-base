import { useState } from "react";
import { Link } from "@tanstack/react-router";

import { answerText, shuffle } from "../engine";
import type { QuizItem } from "../types";
import QuizRunner from "./QuizRunner";
import { useStudy } from "./StudyContext";

export default function WrongSection() {
    const { subject, progress, update } = useStudy();
    const [session, setSession] = useState<QuizItem[] | null>(null);

    const items = Object.keys(progress.wrong)
        .map((id) => subject.bank.find((item) => item.id === id))
        .filter((item): item is QuizItem => Boolean(item))
        .sort(
            (a, b) =>
                (progress.wrong[b.id]?.t ?? 0) - (progress.wrong[a.id]?.t ?? 0),
        );

    if (session) {
        return (
            <QuizRunner
                items={session}
                mode="wrong"
                onExit={() => setSession(null)}
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
                    onClick={() => setSession(shuffle(items))}
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
                    <button
                        className="st-btn sm ghost mt-2"
                        onClick={() => setSession([item])}
                    >
                        重做这题
                    </button>
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
        </div>
    );
}
