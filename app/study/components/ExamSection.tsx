import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

import { useAi } from "@/app/ai/AiContext";
import AiGradeSheet from "@/app/ai/AiGradeSheet";

import { useStudy } from "./StudyContext";
import {
    EXAM_PRESETS,
    TYPE_ICON,
    TYPE_NAME,
    answerText,
    buildExam,
    bumpDaily,
    fmtTime,
    scoreExam,
    type ExamPreset,
    type ExamResult,
} from "../engine";
import { gameForModule } from "../games/registry";
import { toast } from "../toast";
import type { Answer, QuizItem } from "../types";

export default function ExamSection() {
    const { subject, progress, update } = useStudy();
    const { configured, openSettings } = useAi();
    const [preset, setPreset] = useState<ExamPreset | null>(null);
    const [items, setItems] = useState<QuizItem[]>([]);
    const [answers, setAnswers] = useState<Answer[]>([]);
    const [index, setIndex] = useState(0);
    const [left, setLeft] = useState(0);
    const [startedAt, setStartedAt] = useState(0);
    const [result, setResult] = useState<ExamResult | null>(null);
    const [gradeTarget, setGradeTarget] = useState<{
        item: QuizItem;
        answer: Answer;
    } | null>(null);

    const start = (next: ExamPreset) => {
        const built = buildExam(subject, next);
        setItems(built);
        setAnswers(built.map((item) => (item.type === "multi" ? [] : "")));
        setIndex(0);
        setLeft(next.minutes * 60);
        setStartedAt(Date.now());
        setResult(null);
        setPreset(next);
    };

    const submit = () => {
        if (!preset) return;
        const graded = scoreExam(items, answers);
        setResult(graded);
        update((current) => {
            const stat = { ...current.stat };
            const wrong = { ...current.wrong };
            items.forEach((item, i) => {
                const ok = graded.detail[i];
                const before = stat[item.id] ?? { r: 0, w: 0 };
                stat[item.id] = ok
                    ? { ...before, r: before.r + 1 }
                    : { ...before, w: before.w + 1 };
                if (ok) {
                    delete wrong[item.id];
                } else {
                    wrong[item.id] = {
                        c: (wrong[item.id]?.c ?? 0) + 1,
                        t: Date.now(),
                    };
                }
            });
            return bumpDaily(
                {
                    ...current,
                    stat,
                    wrong,
                    exams: [
                        ...current.exams,
                        {
                            name: preset.name,
                            score: graded.score,
                            date: new Date().toLocaleDateString("zh-CN"),
                            ts: Date.now(),
                        },
                    ].slice(-30),
                },
                {
                    questions: items.length,
                    correct: graded.detail.filter(Boolean).length,
                },
            );
        });
    };

    // 倒计时：每次 tick 重新排一个 1s 定时器，到点自动交卷
    useEffect(() => {
        if (!preset || result) return;
        if (left <= 0) {
            submit();
            return;
        }
        const timer = window.setTimeout(() => setLeft((v) => v - 1), 1000);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preset, result, left]);

    /* ---------------- 选卷 ---------------- */
    if (!preset) {
        const history = progress.exams.slice(-3).reverse();
        return (
            <div>
                <div className="st-card" style={{ padding: 16 }}>
                    <div
                        className="st-tiny"
                        style={{ letterSpacing: 1, fontWeight: 700 }}
                    >
                        MOCK EXAM
                    </div>
                    <div className="text-[19px] font-extrabold">模拟考试</div>
                    <div className="st-tiny mt-1">
                        按真实题型配比抽题，倒计时交卷，自动评分并逐题解析。
                        名解与简答按关键词自动判分。
                    </div>
                </div>

                <div className="st-sec">选择卷型</div>
                <div className="mod-grid">
                    {EXAM_PRESETS.map((item) => (
                        <button
                            key={item.key}
                            className="mod"
                            style={{ textAlign: "left" }}
                            onClick={() => start(item)}
                        >
                            <div className="mod-ic">
                                {item.key === "quick"
                                    ? "⚡"
                                    : item.key === "std"
                                      ? "📄"
                                      : "🎯"}
                            </div>
                            <div className="mod-t">{item.name}</div>
                            <div className="mod-s">{item.desc}</div>
                            <div className="mod-ring">开始</div>
                        </button>
                    ))}
                </div>

                {history.length > 0 && (
                    <>
                        <div className="st-sec">最近成绩</div>
                        <div className="st-card">
                            {history.map((record, i) => (
                                <div
                                    key={i}
                                    className="st-between"
                                    style={{
                                        padding: "8px 0",
                                        borderBottom:
                                            i < history.length - 1
                                                ? "1px solid var(--line)"
                                                : "none",
                                    }}
                                >
                                    <div>
                                        <b>{record.name}</b>
                                        <div className="st-tiny">
                                            {record.date}
                                        </div>
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 19,
                                            fontWeight: 800,
                                            color:
                                                record.score >= 80
                                                    ? "var(--ok)"
                                                    : record.score >= 60
                                                      ? "var(--warn)"
                                                      : "var(--no)",
                                        }}
                                    >
                                        {record.score}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                <div className="trap mt-3">
                    ⚠️
                    考试过程中请勿退出页面，计时不会暂停。名解/简答按关键词命中率判分，答得越全得分越高。
                </div>
            </div>
        );
    }

    /* ---------------- 交卷结果 ---------------- */
    if (result) {
        const color =
            result.score >= 80
                ? "var(--ok)"
                : result.score >= 60
                  ? "var(--warn)"
                  : "var(--no)";
        const rightCount = result.detail.filter(Boolean).length;
        const seconds = Math.round((Date.now() - startedAt) / 1000);
        const moduleStats = subject.modules
            .map((mod) => {
                const indexes = items
                    .map((item, index) => (item.m === mod.id ? index : -1))
                    .filter((index) => index >= 0);
                if (!indexes.length) return null;
                const ok = indexes.filter(
                    (index) => result.detail[index],
                ).length;
                return {
                    mod,
                    ok,
                    total: indexes.length,
                    pct: Math.round((ok / indexes.length) * 100),
                };
            })
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
            .sort((a, b) => a.pct - b.pct);
        return (
            <div>
                <div
                    className="st-card st-center"
                    style={{ padding: "22px 16px" }}
                >
                    <div className="score-ring">
                        <svg width="150" height="150" viewBox="0 0 150 150">
                            <circle
                                cx="75"
                                cy="75"
                                r="62"
                                fill="none"
                                stroke="var(--line)"
                                strokeWidth="11"
                            />
                            <circle
                                cx="75"
                                cy="75"
                                r="62"
                                fill="none"
                                stroke={color}
                                strokeWidth="11"
                                strokeLinecap="round"
                                strokeDasharray={2 * Math.PI * 62}
                                strokeDashoffset={
                                    2 * Math.PI * 62 * (1 - result.score / 100)
                                }
                            />
                        </svg>
                        <div className="val">
                            <b style={{ color }}>{result.score}</b>
                            <span>总分</span>
                        </div>
                    </div>
                    <div className="mt-2 text-[15px] font-extrabold">
                        {result.score >= 80
                            ? "🎉 优秀，可以放心上考场了"
                            : result.score >= 60
                              ? "💪 及格，错题再刷一轮更稳"
                              : "📖 基础还需补，先回知识卡"}
                    </div>
                    <div
                        className="st-row mt-3"
                        style={{ justifyContent: "center", gap: 16 }}
                    >
                        <div>
                            <div style={{ fontWeight: 800 }}>
                                {rightCount}/{items.length}
                            </div>
                            <div className="st-tiny">答对</div>
                        </div>
                        <div>
                            <div style={{ fontWeight: 800 }}>
                                {fmtTime(seconds)}
                            </div>
                            <div className="st-tiny">用时</div>
                        </div>
                        <div>
                            <div style={{ fontWeight: 800 }}>{preset.name}</div>
                            <div className="st-tiny">卷型</div>
                        </div>
                    </div>
                </div>

                <div className="st-sec">分项得分</div>
                <div className="st-card">
                    {Object.entries(result.byType).map(([type, bucket]) => (
                        <div
                            key={type}
                            className="st-between"
                            style={{ padding: "7px 0" }}
                        >
                            <div>
                                {TYPE_ICON[type as keyof typeof TYPE_ICON]}{" "}
                                {TYPE_NAME[type as keyof typeof TYPE_NAME]}
                            </div>
                            <div
                                style={{
                                    fontWeight: 800,
                                    color:
                                        bucket.ok === bucket.n
                                            ? "var(--ok)"
                                            : bucket.ok / bucket.n >= 0.6
                                              ? "var(--warn)"
                                              : "var(--no)",
                                }}
                            >
                                {bucket.ok}/{bucket.n}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="st-sec">下一步：用实战补短板</div>
                <div className="st-card">
                    {moduleStats.slice(0, 3).map(({ mod, ok, total, pct }) => {
                        const game = gameForModule(mod.id);
                        return (
                            <div
                                key={mod.id}
                                className="st-between"
                                style={{ padding: "8px 0", gap: 10 }}
                            >
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 800 }}>
                                        {mod.icon} {mod.name}
                                    </div>
                                    <div className="st-tiny">
                                        {ok}/{total} 题 · 正确率 {pct}%
                                    </div>
                                </div>
                                {game ? (
                                    <Link
                                        to="/study/$subjectId/$section"
                                        params={{
                                            subjectId: subject.id,
                                            section: "games",
                                        }}
                                        search={{ game: game.id }}
                                        className="st-btn sm line"
                                    >
                                        🎮 {game.title}
                                    </Link>
                                ) : (
                                    <Link
                                        to="/study/$subjectId/$section"
                                        params={{
                                            subjectId: subject.id,
                                            section: "cards",
                                        }}
                                        search={{ m: mod.id }}
                                        className="st-btn sm ghost"
                                    >
                                        📖 看卡
                                    </Link>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="st-sec">逐题解析</div>
                <div className="st-card">
                    {items.map((item, i) => (
                        <div className="review" key={item.id}>
                            <div className="review-q">
                                <span
                                    className={`badge ${result.detail[i] ? "ok" : "no"}`}
                                >
                                    {result.detail[i] ? "对" : "错"}
                                </span>
                                {i + 1}. {item.stem}
                            </div>
                            <div className="review-a">
                                <b>答案：</b>
                                {answerText(item)}
                                <br />
                                <b>解析：</b>
                                {item.exp ?? ""}
                            </div>
                            {(item.type === "term" ||
                                item.type === "short") && (
                                <button
                                    className="st-btn sm ghost mt-2"
                                    onClick={() => {
                                        if (!configured) {
                                            openSettings();
                                            toast("先配置一下 AI Key");
                                            return;
                                        }
                                        setGradeTarget({
                                            item,
                                            answer: answers[i],
                                        });
                                    }}
                                >
                                    🤖 AI 批改
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                <div className="st-row mt-4" style={{ gap: 10 }}>
                    <button
                        className="st-btn ghost"
                        style={{ flex: 1 }}
                        onClick={() => setPreset(null)}
                    >
                        再考一次
                    </button>
                </div>

                <AiGradeSheet
                    open={Boolean(gradeTarget)}
                    onClose={() => setGradeTarget(null)}
                    subject={subject}
                    item={gradeTarget?.item ?? null}
                    answer={gradeTarget?.answer}
                    moduleName={
                        subject.modules.find(
                            (mod) => mod.id === gradeTarget?.item.m,
                        )?.name
                    }
                />
            </div>
        );
    }

    /* ---------------- 考试中 ---------------- */
    const item = items[index];
    const answered = answers.filter((value) =>
        Array.isArray(value) ? value.length : String(value ?? "").trim().length,
    ).length;
    const options = "o" in item ? item.o : [];
    const picked = answers[index];

    return (
        <div>
            <div className="exam-bar">
                <div className={`timer ${left <= 300 ? "warn" : ""}`}>
                    {fmtTime(left)}
                </div>
                <div style={{ flex: 1 }}>
                    <div className="qprog">
                        <i
                            style={{
                                width: `${Math.round((answered / items.length) * 100)}%`,
                            }}
                        />
                    </div>
                </div>
                <button
                    className="st-btn sm line"
                    onClick={() => {
                        if (
                            answered < items.length &&
                            !window.confirm(
                                `还有 ${items.length - answered} 题未作答，确定交卷吗？`,
                            )
                        ) {
                            return;
                        }
                        submit();
                    }}
                >
                    交卷
                </button>
            </div>

            <div className="st-row" style={{ gap: 6, marginBottom: 8 }}>
                <span className="st-chip b">{TYPE_NAME[item.type]}</span>
                <span className="st-chip">
                    {subject.modules.find((m) => m.id === item.m)?.name}
                </span>
                <span className="st-chip">
                    {index + 1}/{items.length}
                </span>
            </div>

            <div className="stem">
                <span className="qn">{index + 1}.</span>
                {item.stem.split("____").map((part, i, arr) => (
                    <span key={i}>
                        {part}
                        {i < arr.length - 1 && <u>______</u>}
                    </span>
                ))}
            </div>

            {(item.type === "single" || item.type === "multi") && (
                <div className="opts">
                    {options.map((option, i) => {
                        const isPicked = Array.isArray(picked)
                            ? picked.includes(i)
                            : picked === i;
                        return (
                            <button
                                key={i}
                                className={`opt ${isPicked ? "sel" : ""}`}
                                onClick={() =>
                                    setAnswers((prev) =>
                                        prev.map((value, k) => {
                                            if (k !== index) return value;
                                            if (item.type === "single")
                                                return i;
                                            const list =
                                                (value as number[]) ?? [];
                                            return list.includes(i)
                                                ? list.filter((n) => n !== i)
                                                : [...list, i];
                                        }),
                                    )
                                }
                            >
                                <span className="opt-k">
                                    {String.fromCharCode(65 + i)}
                                </span>
                                <span>{option}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {item.type === "multi" && (
                <div className="st-tiny mt-2">多选题：选全才得分</div>
            )}

            {(item.type === "blank" ||
                item.type === "short" ||
                item.type === "term") && (
                <textarea
                    className="st-input"
                    placeholder={
                        item.type === "blank"
                            ? "输入答案"
                            : item.type === "term"
                              ? "请写出名词解释"
                              : "请作答…"
                    }
                    value={String(picked ?? "")}
                    onChange={(event) =>
                        setAnswers((prev) =>
                            prev.map((value, k) =>
                                k === index ? event.target.value : value,
                            ),
                        )
                    }
                />
            )}

            <div className="qfoot">
                <button
                    className="st-btn ghost"
                    disabled={index === 0}
                    onClick={() => setIndex(Math.max(0, index - 1))}
                >
                    上一题
                </button>
                {index < items.length - 1 ? (
                    <button
                        className="st-btn"
                        style={{ flex: 1 }}
                        onClick={() => setIndex(index + 1)}
                    >
                        下一题
                    </button>
                ) : (
                    <button
                        className="st-btn"
                        style={{ flex: 1 }}
                        onClick={submit}
                    >
                        交卷
                    </button>
                )}
            </div>

            <div className="st-sec">答题卡</div>
            <div className="dots">
                {items.map((_, i) => {
                    const value = answers[i];
                    const filled = Array.isArray(value)
                        ? value.length > 0
                        : String(value ?? "").trim().length > 0;
                    return (
                        <button
                            key={i}
                            className={`dot ${filled ? "done" : ""} ${i === index ? "cur" : ""}`}
                            onClick={() => setIndex(i)}
                        >
                            {i + 1}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
