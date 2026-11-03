import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";

import { useStudy } from "./StudyContext";
import AiCoachCard from "../ai/AiCoachCard";
import { useAi } from "../ai/AiContext";
import AiPanel from "../ai/AiPanel";
import { WEEKLY_CHIPS, weekKey, weeklyMessages } from "../ai/prompts";
import { cardStats, daysLeft, questionStats, streakDays } from "../engine";
import { toast } from "../toast";

export default function SubjectHome() {
    const { subject, progress } = useStudy();
    const { configured, openSettings } = useAi();
    const [weeklyOpen, setWeeklyOpen] = useState(false);
    const cards = cardStats(subject, progress);
    const questions = questionStats(progress);
    const left = daysLeft(subject.examDate);
    const streak = streakDays(progress);
    const ward = progress.games?.["ward-hazard"];
    const weeklyPrompt = useMemo(
        () => weeklyMessages(subject, progress),
        [subject, progress],
    );
    const weeklyCacheKey = `weekly:v1:${subject.id}:${weekKey()}`;

    return (
        <div>
            <div className="hero">
                <div className="hero-dday">
                    {left === null
                        ? "长期学习"
                        : left > 0
                          ? `距 ${new Date(subject.examDate!).getMonth() + 1} 月 ${new Date(subject.examDate!).getDate()} 日考试还有`
                          : "考试日到了"}
                </div>
                <div className="hero-num">
                    {left === null ? (
                        "随时"
                    ) : left > 0 ? (
                        <>
                            {left}
                            <small>天</small>
                        </>
                    ) : (
                        "今天"
                    )}
                </div>
                <div className="hero-ttl">{subject.subtitle}</div>
                <div className="hero-bar">
                    <i style={{ width: `${cards.percent}%` }} />
                </div>
                <div className="hero-meta">
                    <span>
                        掌握 {cards.known}/{cards.total} · 互动 {cards.played}
                    </span>
                    <span>已练 {questions.done} 题</span>
                    <span>连续 {streak} 天</span>
                </div>
            </div>

            <div className="st-sec">AI 学习搭子</div>
            <AiCoachCard subject={subject} progress={progress} />

            <div className="st-card">
                <div className="st-between">
                    <div>
                        <div className="text-[13px] font-extrabold">
                            📊 本周学习周报
                        </div>
                        <div className="st-tiny">
                            用真实数据写一份有温度的复盘
                        </div>
                    </div>
                    <button
                        className="st-btn sm line"
                        onClick={() => {
                            if (!configured) {
                                openSettings();
                                toast("先配置一下 AI Key");
                                return;
                            }
                            setWeeklyOpen(true);
                        }}
                    >
                        生成周报
                    </button>
                </div>
            </div>

            <div className="st-sec">快速开始</div>
            <div className="quick-grid">
                <Link
                    to="/study/$subjectId/$section"
                    params={{ subjectId: subject.id, section: "quiz" }}
                    search={{ quick: 1 }}
                    className="quick"
                >
                    <b>🎯 5 分钟快刷</b>
                    <span>10 道混合题，通勤路上就能做完</span>
                </Link>
                <Link
                    to="/study/$subjectId/$section"
                    params={{ subjectId: subject.id, section: "wrong" }}
                    className="quick"
                >
                    <b>🔁 错题复习</b>
                    <span>
                        {Object.keys(progress.wrong).length
                            ? `${Object.keys(progress.wrong).length} 道待复习`
                            : "还没有错题，先去做几道"}
                    </span>
                </Link>
                <Link
                    to="/study/$subjectId/$section"
                    params={{ subjectId: subject.id, section: "games" }}
                    className="quick"
                >
                    <b>🎮 3D 实战</b>
                    <span>
                        {ward
                            ? `${"★".repeat(ward.stars)}${"☆".repeat(3 - ward.stars)} 最佳 ${ward.best} 分`
                            : "夜巡病房，找出 8 处安全隐患"}
                    </span>
                </Link>
                <Link
                    to="/study/$subjectId/$section"
                    params={{ subjectId: subject.id, section: "exam" }}
                    className="quick"
                >
                    <b>⏱️ 模拟考</b>
                    <span>计时交卷，提前适应考试节奏</span>
                </Link>
                <Link
                    to="/study/$subjectId/$section"
                    params={{ subjectId: subject.id, section: "memo" }}
                    className="quick"
                >
                    <b>🧠 口诀大全</b>
                    <span>考前 10 分钟，只看这一页</span>
                </Link>
            </div>

            <div className="st-sec">知识模块</div>
            <div className="mod-grid">
                {subject.modules.map((mod) => {
                    const list = subject.cards.filter((c) => c.m === mod.id);
                    const known = list.filter(
                        (c) => progress.cards[c.id]?.k,
                    ).length;
                    return (
                        <Link
                            key={mod.id}
                            to="/study/$subjectId/$section"
                            params={{
                                subjectId: subject.id,
                                section: "cards",
                            }}
                            search={{ m: mod.id }}
                            className="mod"
                            style={{ "--mc": mod.c } as React.CSSProperties}
                        >
                            <span className="glow" />
                            <div className="mod-ic">{mod.icon}</div>
                            <div className="mod-t">{mod.name}</div>
                            <div className="mod-s">{mod.desc}</div>
                            <div className="mod-ring">
                                {known}/{list.length}
                            </div>
                        </Link>
                    );
                })}
            </div>

            <div className="st-card mt-4">
                <div className="text-[13px] font-extrabold">📌 复习建议</div>
                <div className="st-tiny mt-1">
                    {left !== null && left > 7
                        ? `还剩 ${left} 天：前 6 天过知识卡 + 分题型刷题，中间几天做模拟考，最后 2 天只看口诀和错题。每天 20 分钟比考前突击有效。`
                        : left !== null && left > 0
                          ? `只剩 ${left} 天了：优先刷模拟考和错题本，知识卡只看标「高频」「易错」的。`
                          : "按自己的节奏来：先过一遍知识卡，再分题型刷题，最后用模拟考查漏。"}
                </div>
            </div>

            <AiPanel
                open={weeklyOpen}
                onClose={() => setWeeklyOpen(false)}
                title="本周学习周报"
                subtitle={`${subject.title} · ${weekKey()}`}
                cacheKey={weeklyCacheKey}
                messages={weeklyPrompt}
                chips={WEEKLY_CHIPS}
                intro="AI 会引用你的真实进度和错题，不会编数据。"
            />
        </div>
    );
}
