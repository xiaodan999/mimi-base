import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";

// 这份完整样式跟着 /study 路由的 lazy 组件一起加载，不进首屏 CSS。
import "@/app/study/study.css";

import { cardStatsFromMeta, daysLeft, questionStats } from "../engine";
import { KIND_LABEL, SUBJECT_META } from "../meta";
import { useStudySummaries } from "../progress";
import ProgressRing from "./ProgressRing";

export default function StudyHub() {
    const { data: summaries } = useStudySummaries();

    return (
        <div className="study-root">
            <div className="px-4 pt-4">
                <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
                    <BookOpen
                        className="size-6 text-primary"
                        aria-hidden="true"
                    />
                    学习基地
                </h1>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                    所有科目都在这里，进度会跟着账号走。
                </p>
            </div>

            <div className="study-body">
                <div className="hub-grid">
                    {SUBJECT_META.map((subject) => {
                        const progress = summaries?.[subject.id];
                        const cards = progress
                            ? cardStatsFromMeta(subject, progress)
                            : null;
                        const questions = progress
                            ? questionStats(progress)
                            : null;
                        const left = daysLeft(subject.examDate);
                        const gamePlays = progress
                            ? Object.keys(progress.games ?? {}).length
                            : 0;
                        const gameStars = progress
                            ? Object.values(progress.games ?? {}).reduce(
                                  (sum, game) => sum + game.stars,
                                  0,
                              )
                            : 0;
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
                                    <ProgressRing
                                        value={cards?.percent ?? 0}
                                        size={46}
                                        stroke={5}
                                        color={subject.accent}
                                        label={`${cards?.percent ?? 0}%`}
                                        className="mt-0.5"
                                    />
                                </div>

                                <div className="hub-meta">
                                    {left !== null && (
                                        <span className="st-chip w shrink-0">
                                            剩 {left} 天
                                        </span>
                                    )}
                                    <span className="st-chip">
                                        {KIND_LABEL[subject.kind]}
                                    </span>
                                    <span className="st-chip">
                                        {subject.cardCount} 张卡 ·{" "}
                                        {subject.bankCount} 题
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
                                    {gamePlays > 0 && (
                                        <span className="st-chip">
                                            🎮 {gamePlays} 个实战
                                            {gameStars > 0
                                                ? ` · ★${gameStars}`
                                                : ""}
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
                        在 app/study/meta.ts 加一份元数据、在 loadSubject
                        里补一个 动态
                        import，这里就会自动多一张卡片，题库、知识卡、模拟考、
                        错题本全部通用。
                    </div>
                </div>
            </div>
        </div>
    );
}
