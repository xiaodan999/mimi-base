import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";

import { useAi } from "@/app/ai/AiContext";
import AiGradeSheet from "@/app/ai/AiGradeSheet";
import AiPanel from "@/app/ai/AiPanel";
import { hashText } from "@/app/ai/cache";
import {
    WRONG_CHIPS,
    diagnoseWrongMessages,
    userAnswerText,
} from "@/app/ai/prompts";
import { useBackDismiss } from "@/lib/useBackDismiss";

import { TYPE_NAME, answerText, isAnswerCorrect } from "../engine";
import { gameForModule } from "../games/registry";
import { recordQuizAnswer } from "../progress-reducers";
import { toast } from "../toast";
import type { Answer, QuizItem } from "../types";
import { useStudy } from "./StudyContext";

type Props = {
    items: QuizItem[];
    mode: "practice" | "wrong";
    onExit: () => void;
    /** AI 变式题不写进学习进度 */
    track?: boolean;
};

export default function QuizRunner({
    items,
    mode,
    onExit,
    track = true,
}: Props) {
    const { subject, update } = useStudy();
    const { configured, openSettings } = useAi();
    // 做题是整屏浮层：侧滑返回应该退出练习，而不是退掉下面的页面。
    useBackDismiss(true, onExit);
    const [index, setIndex] = useState(0);
    const [answers, setAnswers] = useState<Answer[]>(() =>
        items.map(() => undefined),
    );
    const [done, setDone] = useState<boolean[]>(() => items.map(() => false));
    const [graded, setGraded] = useState<boolean[]>(() =>
        items.map(() => false),
    );
    const [result, setResult] = useState<boolean[]>(() =>
        items.map(() => false),
    );
    const [finished, setFinished] = useState(false);
    const startedAt = useRef(Date.now());
    const scrollRef = useRef<HTMLDivElement>(null);
    const [revealed, setRevealed] = useState<string[]>([]);
    const [analysis, setAnalysis] = useState<{
        item: QuizItem;
        answer: Answer;
    } | null>(null);
    const [gradeTarget, setGradeTarget] = useState<{
        item: QuizItem;
        answer: Answer;
    } | null>(null);

    const item = items[index];
    const total = items.length;
    const progressPercent = Math.round(((index + 1) / total) * 100);

    const record = (target: QuizItem, ok: boolean) => {
        if (!track) return;
        // 纯 reducer：统计 / 错题 / 每日任务 / SM-2 排程一并更新，可单测。
        update((current) => recordQuizAnswer(current, target, ok));
    };

    const settle = (ok: boolean) => {
        setDone((prev) => prev.map((v, i) => (i === index ? true : v)));
        setResult((prev) => prev.map((v, i) => (i === index ? ok : v)));
        record(item, ok);
    };

    const choose = (optionIndex: number) => {
        if (done[index]) return;
        if (item.type === "single") {
            setAnswers((prev) =>
                prev.map((v, i) => (i === index ? optionIndex : v)),
            );
            settle(optionIndex === item.a);
            return;
        }
        const current = (answers[index] as number[] | undefined) ?? [];
        const next = current.includes(optionIndex)
            ? current.filter((i) => i !== optionIndex)
            : [...current, optionIndex];
        setAnswers((prev) => prev.map((v, i) => (i === index ? next : v)));
    };

    const submit = () => {
        if (item.type === "multi") {
            const picked = (answers[index] as number[] | undefined) ?? [];
            if (!picked.length) {
                toast("至少选一个");
                return;
            }
            settle(
                picked.slice().sort().join() === item.a.slice().sort().join(),
            );
            return;
        }
        if (item.type === "blank") {
            const value = String(answers[index] ?? "").trim();
            if (!value) {
                toast("先写点答案吧");
                return;
            }
            settle(isAnswerCorrect(item, value));
            return;
        }
        setDone((prev) => prev.map((v, i) => (i === index ? true : v)));
    };

    const selfGrade = (score: 0 | 0.5 | 1) => {
        setGraded((prev) => prev.map((v, i) => (i === index ? true : v)));
        setResult((prev) =>
            prev.map((v, i) => (i === index ? score >= 0.5 : v)),
        );
        record(item, score >= 0.5);
        if (score === 0.5 && track) {
            update((current) => {
                const stat = current.stat[item.id];
                if (!stat || stat.r === 0) return current;
                return {
                    ...current,
                    stat: {
                        ...current.stat,
                        [item.id]: { ...stat, r: stat.r - 1 },
                    },
                };
            });
        }
    };

    const next = () => {
        if (index + 1 >= total) {
            setFinished(true);
            return;
        }
        setIndex(index + 1);
        setRevealed([]);
        scrollRef.current?.scrollTo({ top: 0 });
    };

    const rightCount = useMemo(() => result.filter(Boolean).length, [result]);

    const analysisModule = analysis
        ? subject.modules.find((mod) => mod.id === analysis.item.m)?.name
        : undefined;
    const analysisMessages = useMemo(
        () =>
            analysis
                ? diagnoseWrongMessages(
                      subject,
                      analysis.item,
                      analysis.answer,
                      analysisModule,
                  )
                : [],
        [analysis, analysisModule, subject],
    );
    const gradeModule = gradeTarget
        ? subject.modules.find((mod) => mod.id === gradeTarget.item.m)?.name
        : undefined;

    const openAnalysis = (item: QuizItem, answer: Answer) => {
        if (!configured) {
            openSettings();
            toast("先配置一下 AI Key");
            return;
        }
        setAnalysis({ item, answer });
    };

    const overlays = (
        <>
            <AiPanel
                open={Boolean(analysis)}
                onClose={() => setAnalysis(null)}
                title="错题验尸"
                subtitle={analysisModule}
                cacheKey={
                    analysis
                        ? `wrong:${analysis.item.id}:${hashText(
                              userAnswerText(analysis.item, analysis.answer),
                          )}`
                        : "wrong:none"
                }
                messages={analysisMessages}
                chips={WRONG_CHIPS}
                intro="AI 会猜你当时为什么选它，再告诉你下次怎么识别。"
            />
            <AiGradeSheet
                open={Boolean(gradeTarget)}
                onClose={() => setGradeTarget(null)}
                subject={subject}
                item={gradeTarget?.item ?? null}
                answer={gradeTarget?.answer}
                moduleName={gradeModule}
                onAdopt={(score) => {
                    if (!graded[index]) selfGrade(score);
                    setGradeTarget(null);
                }}
            />
        </>
    );

    if (finished) {
        const percent = Math.round((rightCount / total) * 100);
        const color =
            percent >= 80 ? "#16a34a" : percent >= 60 ? "#d97706" : "#dc2626";
        const seconds = Math.round((Date.now() - startedAt.current) / 1000);
        const wrongItems = items.filter((_, i) => !result[i]);
        return (
            <div className="study-root kb-screen fixed inset-0 z-50 flex flex-col bg-[hsl(var(--background))]">
                <div className="flex-1 overflow-auto overscroll-contain px-4 py-6">
                    <div
                        className="st-card st-center"
                        style={{ padding: "24px 16px" }}
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
                                        2 * Math.PI * 62 * (1 - percent / 100)
                                    }
                                />
                            </svg>
                            <div className="val">
                                <b style={{ color }}>{percent}%</b>
                                <span>正确率</span>
                            </div>
                        </div>
                        <div
                            className="st-row mt-3"
                            style={{ justifyContent: "center", gap: 18 }}
                        >
                            <div>
                                <div
                                    style={{
                                        fontSize: 19,
                                        fontWeight: 800,
                                        color: "var(--ok)",
                                    }}
                                >
                                    {rightCount}
                                </div>
                                <div className="st-tiny">答对</div>
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontSize: 19,
                                        fontWeight: 800,
                                        color: "var(--no)",
                                    }}
                                >
                                    {total - rightCount}
                                </div>
                                <div className="st-tiny">答错</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 19, fontWeight: 800 }}>
                                    {seconds}s
                                </div>
                                <div className="st-tiny">用时</div>
                            </div>
                        </div>
                        <div className="st-tiny mt-3">
                            {percent >= 80
                                ? "🎉 很棒，保持这个状态！"
                                : percent >= 60
                                  ? "💪 及格线以上，错题再过一遍就稳了。"
                                  : "📖 别急，回知识卡把这块补一补再来。"}
                        </div>
                    </div>

                    {wrongItems.length > 0 && (
                        <>
                            <div className="st-sec">
                                本轮错题（{wrongItems.length}）
                            </div>
                            <div className="st-card">
                                {wrongItems.map((wrong) => {
                                    const answerIndex = items.indexOf(wrong);
                                    const game = gameForModule(wrong.m);
                                    return (
                                        <div className="review" key={wrong.id}>
                                            <div className="review-q">
                                                {wrong.stem}
                                            </div>
                                            <div className="review-a">
                                                <b>答案：</b>
                                                {answerText(wrong)}
                                                <br />
                                                <b>解析：</b>
                                                {wrong.exp ?? ""}
                                            </div>
                                            <div
                                                className="st-row mt-2"
                                                style={{
                                                    gap: 6,
                                                    flexWrap: "wrap",
                                                }}
                                            >
                                                <button
                                                    className="st-btn sm ghost"
                                                    onClick={() =>
                                                        openAnalysis(
                                                            wrong,
                                                            answers[
                                                                answerIndex
                                                            ],
                                                        )
                                                    }
                                                >
                                                    🔬 AI 验尸
                                                </button>
                                                {game && (
                                                    <Link
                                                        to="/study/$subjectId/$section"
                                                        params={{
                                                            subjectId:
                                                                subject.id,
                                                            section: "games",
                                                        }}
                                                        search={{
                                                            game: game.id,
                                                        }}
                                                        className="st-btn sm line"
                                                    >
                                                        🎮 去实战：
                                                        {game.title}
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    <div className="st-row mt-4" style={{ gap: 10 }}>
                        <button
                            className="st-btn ghost"
                            style={{ flex: 1 }}
                            onClick={onExit}
                        >
                            返回
                        </button>
                        <button
                            className="st-btn"
                            style={{ flex: 1 }}
                            onClick={() => {
                                setIndex(0);
                                setAnswers(items.map(() => undefined));
                                setDone(items.map(() => false));
                                setGraded(items.map(() => false));
                                setResult(items.map(() => false));
                                setFinished(false);
                                startedAt.current = Date.now();
                            }}
                        >
                            再练一遍
                        </button>
                    </div>
                </div>
                {overlays}
            </div>
        );
    }

    const submitted = done[index];
    const options = "o" in item ? item.o : [];
    const picked = answers[index];

    return (
        <div className="study-root kb-screen fixed inset-0 z-50 flex flex-col bg-[hsl(var(--background))]">
            <div className="flex items-center gap-3 px-4 pb-2 pt-3">
                <div className="qprog">
                    <i style={{ width: `${progressPercent}%` }} />
                </div>
                <div className="qnum">
                    {index + 1}/{total}
                </div>
                <button
                    className="grid size-8 place-items-center rounded-full bg-card shadow-sm"
                    onClick={onExit}
                    aria-label="退出练习"
                >
                    <X className="size-4" />
                </button>
            </div>

            <div
                ref={scrollRef}
                className="flex-1 overflow-auto overscroll-contain px-4 pb-8"
            >
                <div className="st-row" style={{ gap: 6, marginBottom: 8 }}>
                    <span className="st-chip b">{TYPE_NAME[item.type]}</span>
                    <span className="st-chip">
                        {subject.modules.find((m) => m.id === item.m)?.name}
                    </span>
                    {mode === "wrong" && (
                        <span className="st-chip r">错题重练</span>
                    )}
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
                            const correct =
                                item.type === "single"
                                    ? i === item.a
                                    : item.a.includes(i);
                            let cls = "";
                            if (submitted) {
                                if (correct) cls = "ok";
                                else if (isPicked) cls = "bad";
                            } else if (isPicked) {
                                cls = "sel";
                            }
                            return (
                                <button
                                    key={i}
                                    className={`opt ${cls}`}
                                    onClick={() => choose(i)}
                                    disabled={submitted}
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

                {item.type === "multi" && !submitted && (
                    <div className="qfoot">
                        <button className="st-btn block" onClick={submit}>
                            提交答案（多选）
                        </button>
                    </div>
                )}

                {item.type === "blank" && (
                    <>
                        <input
                            className="st-input"
                            placeholder="输入答案"
                            value={String(picked ?? "")}
                            disabled={submitted}
                            onChange={(event) =>
                                setAnswers((prev) =>
                                    prev.map((v, i) =>
                                        i === index ? event.target.value : v,
                                    ),
                                )
                            }
                        />
                        {!submitted && (
                            <div className="qfoot">
                                <button
                                    className="st-btn block"
                                    onClick={submit}
                                >
                                    提交答案
                                </button>
                            </div>
                        )}
                    </>
                )}

                {(item.type === "short" || item.type === "term") &&
                    !submitted && (
                        <>
                            <textarea
                                className="st-input"
                                placeholder={
                                    item.type === "term"
                                        ? "请写出这个名词的解释…"
                                        : "请作答…"
                                }
                                value={String(picked ?? "")}
                                onChange={(event) =>
                                    setAnswers((prev) =>
                                        prev.map((v, i) =>
                                            i === index
                                                ? event.target.value
                                                : v,
                                        ),
                                    )
                                }
                            />
                            <div className="qfoot">
                                <button
                                    className="st-btn block"
                                    onClick={submit}
                                >
                                    看参考答案
                                </button>
                            </div>
                        </>
                    )}

                {(item.type === "short" || item.type === "term") &&
                    submitted && (
                        <>
                            <div className="refbox">
                                <div className="rt">参考答案</div>
                                {item.ans}
                            </div>
                            <div className="st-tiny mt-2">
                                关键词（点一下核对是否写到）：
                            </div>
                            <div className="kws">
                                {item.keys.map((key) => (
                                    <button
                                        key={key}
                                        className={`kw ${revealed.includes(key) ? "on" : ""}`}
                                        onClick={() =>
                                            setRevealed((prev) =>
                                                prev.includes(key)
                                                    ? prev.filter(
                                                          (k) => k !== key,
                                                      )
                                                    : [...prev, key],
                                            )
                                        }
                                    >
                                        {key}
                                    </button>
                                ))}
                            </div>
                            <div className="st-row mt-2" style={{ gap: 8 }}>
                                <button
                                    className="st-btn sm line"
                                    onClick={() =>
                                        setGradeTarget({
                                            item,
                                            answer: answers[index],
                                        })
                                    }
                                >
                                    🤖 AI 批改
                                </button>
                            </div>
                            {!graded[index] && (
                                <>
                                    <div className="st-tiny mt-3">
                                        给自己打个分：
                                    </div>
                                    <div className="selfgrade">
                                        <button
                                            className="st-btn line"
                                            onClick={() => selfGrade(1)}
                                        >
                                            ✅ 会
                                        </button>
                                        <button
                                            className="st-btn ghost"
                                            onClick={() => selfGrade(0.5)}
                                        >
                                            🤔 半会
                                        </button>
                                        <button
                                            className="st-btn ghost"
                                            onClick={() => selfGrade(0)}
                                        >
                                            ❌ 不会
                                        </button>
                                    </div>
                                </>
                            )}
                        </>
                    )}

                {submitted && item.type !== "short" && item.type !== "term" && (
                    <div className={`fb ${result[index] ? "ok" : "bad"}`}>
                        <div className="fb-t">
                            {result[index] ? "✅ 回答正确" : "❌ 回答错误"}
                        </div>
                        {!result[index] && (
                            <div className="fb-ref">
                                <b>正确答案：</b>
                                {answerText(item)}
                            </div>
                        )}
                        <div className="fb-ref">
                            <b>解析：</b>
                            {item.exp ?? ""}
                        </div>
                        {!result[index] && (
                            <button
                                className="st-btn sm line mt-2"
                                onClick={() =>
                                    openAnalysis(item, answers[index])
                                }
                            >
                                🔬 AI 验尸：为什么选错
                            </button>
                        )}
                    </div>
                )}

                {(item.type === "short" || item.type === "term"
                    ? graded[index]
                    : submitted) && (
                    <div className="qfoot">
                        <button className="st-btn block" onClick={next}>
                            {index + 1 >= total ? "完成练习" : "下一题"}
                        </button>
                    </div>
                )}
            </div>
            {overlays}
        </div>
    );
}
