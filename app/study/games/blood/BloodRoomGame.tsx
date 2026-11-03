import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { BLOOD_STEPS, type BloodStep } from "./steps";
import { useStudy } from "../../components/StudyContext";
import { fmtTime, shuffle } from "../../engine";
import { toast } from "../../toast";
import ResultPanel from "../components/ResultPanel";
import { recordGame, type GameOutcome } from "../meta";
import { bloodScore } from "../scoring";

type Phase = "intro" | "playing" | "result";

type StepResult = {
    ok: boolean;
    text: string;
    fatal: boolean;
};

const MAX_NEAR_MISS = 3;

function isCorrect(
    step: BloodStep,
    single: number | null,
    multi: Set<number>,
    order: number[],
    orderItems: string[],
    slider: number,
): boolean {
    if (step.type === "single") {
        return Boolean(single !== null && step.options?.[single]?.ok);
    }
    if (step.type === "multi") {
        if (!multi.size) return false;
        return (step.options ?? []).every(
            (option, index) => option.ok === multi.has(index),
        );
    }
    if (step.type === "order") {
        if (order.length !== (step.items?.length ?? 0)) return false;
        return order
            .map((index) => orderItems[index])
            .every((text, index) => text === step.items?.[index]);
    }
    const min = step.answerMin ?? step.min ?? 0;
    const max = step.answerMax ?? step.max ?? 0;
    return slider >= min && slider <= max;
}

export default function BloodRoomGame() {
    const { subject, progress, update } = useStudy();
    const navigate = useNavigate();
    const [phase, setPhase] = useState<Phase>("intro");
    const [index, setIndex] = useState(0);
    const [single, setSingle] = useState<number | null>(null);
    const [multi, setMulti] = useState<Set<number>>(new Set());
    const [order, setOrder] = useState<number[]>([]);
    const [slider, setSlider] = useState(30);
    const [stepResult, setStepResult] = useState<StepResult | null>(null);
    const [nearMiss, setNearMiss] = useState(0);
    const [solved, setSolved] = useState<Set<string>>(new Set());
    const [startedAt, setStartedAt] = useState(0);
    const [elapsed, setElapsed] = useState(0);
    const [outcome, setOutcome] = useState<GameOutcome | null>(null);
    const [lastResult, setLastResult] = useState<{
        score: number;
        stars: 0 | 1 | 2 | 3;
    }>({ score: 0, stars: 0 });
    const recorded = useRef(false);

    const step = BLOOD_STEPS[index];
    const orderItems = useMemo(
        () => (step.type === "order" ? shuffle(step.items ?? []) : []),
        [step.type, step.items],
    );

    useEffect(() => {
        setSingle(null);
        setMulti(new Set());
        setOrder([]);
        setStepResult(null);
        setSlider(
            step.type === "slider"
                ? Math.round(((step.min ?? 5) + (step.max ?? 60)) / 2)
                : 30,
        );
    }, [step.id, step.type, step.min, step.max]);

    useEffect(() => {
        if (phase !== "playing") return;
        const timer = window.setInterval(() => {
            setElapsed(Math.floor((Date.now() - startedAt) / 1000));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [phase, startedAt]);

    const exit = () => {
        void navigate({
            to: "/study/$subjectId/$section",
            params: { subjectId: subject.id, section: "games" },
            search: {},
        });
    };

    const start = () => {
        recorded.current = false;
        setIndex(0);
        setNearMiss(0);
        setSolved(new Set());
        setOutcome(null);
        setElapsed(0);
        setStartedAt(Date.now());
        setPhase("playing");
    };

    const finish = (completed: boolean) => {
        if (recorded.current) return;
        recorded.current = true;
        const seconds = Math.max(
            1,
            Math.round((Date.now() - startedAt) / 1000),
        );
        const scored = bloodScore({
            nearMiss,
            seconds,
            total: BLOOD_STEPS.length,
            cleared: solved.size,
        });
        const next = recordGame(progress, "blood-room", {
            ...scored,
            correct: solved.size,
            total: BLOOD_STEPS.length,
            durationMs: seconds * 1000,
            nearMiss,
            completed,
        });
        update(() => next.progress);
        setOutcome(next);
        setLastResult(scored);
        setPhase("result");
        if (next.unlocked.length) {
            toast(
                `解锁徽章：${next.unlocked
                    .map((badge) => badge.name)
                    .join("、")}`,
            );
        }
    };

    const submit = () => {
        if (stepResult) return;
        const ok = isCorrect(step, single, multi, order, orderItems, slider);

        if (ok) {
            setSolved((current) => new Set(current).add(step.id));
            setStepResult({ ok: true, text: step.rule, fatal: false });
            return;
        }

        const nextNear = nearMiss + 1;
        setNearMiss(nextNear);
        let specific = "";
        if (step.type === "single" && single !== null) {
            specific = step.options?.[single]?.why ?? "";
        }
        setStepResult({
            ok: false,
            text: specific ? `${specific} ${step.rule}` : step.rule,
            fatal: nextNear >= MAX_NEAR_MISS,
        });
    };

    const retry = () => {
        setStepResult(null);
        setSingle(null);
        setMulti(new Set());
        setOrder([]);
    };

    const next = () => {
        if (stepResult?.fatal) {
            finish(false);
            return;
        }
        if (index + 1 >= BLOOD_STEPS.length) {
            finish(true);
            return;
        }
        setIndex((value) => value + 1);
    };

    const toggleOrder = (itemIndex: number) => {
        setOrder((current) =>
            current.includes(itemIndex)
                ? current.filter((value) => value !== itemIndex)
                : [...current, itemIndex],
        );
    };

    if (phase === "result" && outcome) {
        return (
            <ResultPanel
                title="输血密室 · 用血安全"
                subtitle="七道门，一条命。每一步都算数"
                score={lastResult.score}
                stars={lastResult.stars}
                xpGained={outcome.xpGained}
                isBest={outcome.isBest}
                unlocked={outcome.unlocked}
                unit="关"
                correct={solved.size}
                total={BLOOD_STEPS.length}
                gameId="blood-room"
                details={BLOOD_STEPS.map((item) => ({
                    title: item.title,
                    ok: solved.has(item.id),
                    note: item.rule,
                }))}
                onRetry={start}
                onExit={exit}
            />
        );
    }

    if (phase === "intro") {
        return (
            <div className="blood-intro">
                <div className="blood-intro-glow" aria-hidden="true" />
                <div className="blood-intro-card">
                    <div className="gi-kicker">2D 密室 · 用血安全</div>
                    <h1>输血密室</h1>
                    <p>
                        从采血到血袋回收，七道门锁住同一条命。
                        每错一步，就是一次 near miss；三次，患者就会出事。
                    </p>
                    <div className="blood-intro-doors" aria-hidden="true">
                        {BLOOD_STEPS.map((item) => (
                            <span key={item.id}>{item.icon}</span>
                        ))}
                    </div>
                    <button className="g-btn primary lg" onClick={start}>
                        进入密室
                    </button>
                    <p className="gi-note">
                        7 关 · 约 5 分钟 · 依据《质控内容》用血安全章节
                    </p>
                </div>
            </div>
        );
    }

    const confirmDisabled =
        step.type === "single"
            ? single === null
            : step.type === "multi"
              ? multi.size === 0
              : step.type === "order"
                ? order.length !== (step.items?.length ?? 0)
                : false;

    return (
        <div className="game-shell blood-game">
            <div className="game-topbar">
                <button className="g-back" onClick={exit} aria-label="返回病区">
                    ←
                </button>
                <div className="game-topbar-copy">
                    <b>输血密室</b>
                    <span>
                        第 {index + 1}/{BLOOD_STEPS.length} 关 ·{" "}
                        {fmtTime(elapsed)}
                    </span>
                </div>
                <div
                    className="blood-danger"
                    aria-label={`${nearMiss} 次 near miss`}
                >
                    {Array.from({ length: MAX_NEAR_MISS }, (_, i) => (
                        <i key={i} className={i < nearMiss ? "on" : ""}>
                            ●
                        </i>
                    ))}
                    <span>near miss</span>
                </div>
            </div>

            <div className="blood-doors">
                {BLOOD_STEPS.map((item, doorIndex) => {
                    const done = solved.has(item.id);
                    const current = doorIndex === index;
                    return (
                        <div
                            key={item.id}
                            className={`blood-door ${done ? "done" : ""} ${
                                current ? "current" : ""
                            }`}
                        >
                            <span className="blood-door-icon">
                                {done ? "✓" : item.icon}
                            </span>
                            <span className="blood-door-name">
                                {item.title}
                            </span>
                        </div>
                    );
                })}
            </div>

            <div className="blood-stage">
                <div className="blood-scene">{step.scene}</div>
                <h2>
                    {step.icon} {step.title}
                </h2>
                <p className="blood-question">{step.question}</p>

                {step.type === "single" && (
                    <div className="blood-options">
                        {(step.options ?? []).map((option, optionIndex) => (
                            <button
                                key={option.text}
                                className={`blood-option ${
                                    single === optionIndex ? "picked" : ""
                                }`}
                                onClick={() => setSingle(optionIndex)}
                                aria-pressed={single === optionIndex}
                                disabled={Boolean(stepResult)}
                            >
                                <span
                                    className="blood-radio"
                                    aria-hidden="true"
                                >
                                    {single === optionIndex ? "●" : "○"}
                                </span>
                                {option.text}
                            </button>
                        ))}
                    </div>
                )}

                {step.type === "multi" && (
                    <div className="blood-options">
                        {(step.options ?? []).map((option, optionIndex) => {
                            const picked = multi.has(optionIndex);
                            return (
                                <button
                                    key={option.text}
                                    className={`blood-option ${picked ? "picked" : ""}`}
                                    onClick={() =>
                                        setMulti((current) => {
                                            const nextSet = new Set(current);
                                            if (nextSet.has(optionIndex)) {
                                                nextSet.delete(optionIndex);
                                            } else {
                                                nextSet.add(optionIndex);
                                            }
                                            return nextSet;
                                        })
                                    }
                                    aria-pressed={picked}
                                    disabled={Boolean(stepResult)}
                                >
                                    <span
                                        className="blood-check"
                                        aria-hidden="true"
                                    >
                                        {picked ? "✓" : ""}
                                    </span>
                                    {option.text}
                                </button>
                            );
                        })}
                    </div>
                )}

                {step.type === "order" && (
                    <>
                        <div className="blood-order-hint">
                            按顺序点击，点错可以再点一次取消
                        </div>
                        <div className="blood-order">
                            {orderItems.map((text, itemIndex) => {
                                const position = order.indexOf(itemIndex);
                                return (
                                    <button
                                        key={text}
                                        className={`blood-order-item ${
                                            position >= 0 ? "picked" : ""
                                        }`}
                                        onClick={() => toggleOrder(itemIndex)}
                                        disabled={Boolean(stepResult)}
                                    >
                                        {position >= 0 && (
                                            <span className="blood-order-n">
                                                {position + 1}
                                            </span>
                                        )}
                                        {text}
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}

                {step.type === "slider" && (
                    <div className="blood-slider">
                        <div className="blood-slider-value">
                            {slider}
                            <span>{step.unit}</span>
                        </div>
                        <input
                            type="range"
                            min={step.min}
                            max={step.max}
                            step={1}
                            value={slider}
                            onChange={(event) =>
                                setSlider(Number(event.target.value))
                            }
                            aria-label={step.question}
                            disabled={Boolean(stepResult)}
                        />
                        <div className="blood-slider-scale">
                            <span>
                                {step.min}
                                {step.unit}
                            </span>
                            <span>
                                {step.max}
                                {step.unit}
                            </span>
                        </div>
                    </div>
                )}

                {stepResult ? (
                    <div
                        className={`blood-feedback ${
                            stepResult.ok ? "ok" : "bad"
                        }`}
                    >
                        <b>
                            {stepResult.ok
                                ? "通关"
                                : stepResult.fatal
                                  ? "患者安全事件"
                                  : "near miss"}
                        </b>
                        <p>{stepResult.text}</p>
                        <div className="blood-source">依据：{step.source}</div>
                        <div className="gr-actions">
                            {stepResult.ok ? (
                                <button
                                    className="g-btn primary"
                                    onClick={next}
                                >
                                    {index + 1 >= BLOOD_STEPS.length
                                        ? "完成密室"
                                        : "下一关"}
                                </button>
                            ) : stepResult.fatal ? (
                                <button
                                    className="g-btn primary"
                                    onClick={() => finish(false)}
                                >
                                    查看结算
                                </button>
                            ) : (
                                <button
                                    className="g-btn primary"
                                    onClick={retry}
                                >
                                    再试一次
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <button
                        className="g-btn primary lg blood-confirm"
                        onClick={submit}
                        disabled={confirmDisabled}
                    >
                        确认
                    </button>
                )}
            </div>
        </div>
    );
}
