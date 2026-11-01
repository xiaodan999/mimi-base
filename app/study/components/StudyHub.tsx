import { Link } from "@tanstack/react-router";

import { cardStats, daysLeft, questionStats } from "../engine";
import { useStudySummaries } from "../progress";
import { KIND_LABEL, SUBJECTS } from "../registry";

export default function StudyHub() {
    const { data: summaries } = useStudySummaries();

    return (
        <div className="study-root">
            <div className="px-4 pt-4">
                <h1 className="text-2xl font-extrabold tracking-tight">
                    📚 学习基地
                </h1>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                    所有科目都在这里，进度会跟着账号走。
                </p>
            </div>

            <div className="study-body">
                <div className="hub-grid">
                    {SUBJECTS.map((subject) => {
                        const progress = summaries?.[subject.id];
                        const cards = progress
                            ? cardStats(subject, progress)
                            : null;
                        const questions = progress
                            ? questionStats(progress)
                            : null;
                        const left = daysLeft(subject.examDate);
                        return (
                            <Link
                                key={subject.id}
                                to="/study/$subjectId"
                                params={{ subjectId: subject.id }}
                                className="hub-card"
                                style={
                                    {
                                        "--accent": subject.accent,
                                    } as React.CSSProperties
                                }
                            >
                                <span className="glow" />
                                <div className="flex items-start gap-3">
                                    <div className="hub-icon">
                                        {subject.icon}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="hub-title">
                                            {subject.title}
                                        </div>
                                        <div className="hub-sub">
                                            {subject.subtitle}
                                        </div>
                                    </div>
                                    {left !== null && (
                                        <span className="st-chip w shrink-0">
                                            剩 {left} 天
                                        </span>
                                    )}
                                </div>

                                <div className="hub-meta">
                                    <span className="st-chip">
                                        {KIND_LABEL[subject.kind]}
                                    </span>
                                    <span className="st-chip">
                                        {subject.cards.length} 张卡 ·{" "}
                                        {subject.bank.length} 题
                                    </span>
                                    {cards && (
                                        <span className="st-chip b">
                                            掌握 {cards.known}/{cards.total}
                                        </span>
                                    )}
                                    {questions && questions.done > 0 && (
                                        <span className="st-chip g">
                                            正确率 {questions.accuracy}%
                                        </span>
                                    )}
                                </div>
                            </Link>
                        );
                    })}
                </div>

                <div className="st-card mt-4">
                    <div className="text-[13px] font-extrabold">
                        ➕ 以后加科目
                    </div>
                    <div className="st-tiny mt-1">
                        在 app/study/subjects/ 下新建一个目录导出科目数据，再到
                        app/study/registry.ts 注册一行，这里就会自动多一张卡片，
                        题库、知识卡、模拟考、错题本全部通用。
                    </div>
                </div>
            </div>
        </div>
    );
}
