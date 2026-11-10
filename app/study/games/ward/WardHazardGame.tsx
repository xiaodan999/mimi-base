// 通用实战样式随 lazy chunk 一起加载（以前由静态引入的 GameHub 顺带提供）。
import "../games.css";

import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { useStudy } from "../../components/StudyContext";
import { fmtTime, shuffle } from "../../engine";
import { toast } from "../../toast";
import ResultPanel from "../components/ResultPanel";
import { type GameOutcome, recordGame } from "../meta";
import { wardScore } from "../scoring";
import {
    type Hazard,
    type HazardOption,
    HAZARDS,
    SCENE_LABELS,
} from "./hazards";
import WardScene from "./WardScene";

type Phase = "intro" | "playing" | "result";

type Feedback = {
    ok: boolean;
    text: string;
    /** 点按钮后是结束本局，而不是继续 */
    end: boolean;
};

const ROUND_SIZE = 8;
const TIME_TOTAL = 90;
const LIVES = 3;

const DECOYS = [
    { object: "bed-a", title: "1 床床体" },
    { object: "iv-b", title: "2 床输液架" },
    { object: "sink", title: "洗手池" },
    { object: "nurse-station", title: "护士站" },
    { object: "wheelchair", title: "轮椅" },
];

function supportsWebGL(): boolean {
    if (typeof document === "undefined") return false;
    try {
        const canvas = document.createElement("canvas");
        return Boolean(
            canvas.getContext("webgl2") || canvas.getContext("webgl"),
        );
    } catch {
        return false;
    }
}

export default function WardHazardGame() {
    const { subject, progress, update } = useStudy();
    const navigate = useNavigate();
    const [phase, setPhase] = useState<Phase>("intro");
    const [round, setRound] = useState<Hazard[]>([]);
    const [found, setFound] = useState<Set<string>>(new Set());
    const [fixedObjects, setFixedObjects] = useState<Set<string>>(new Set());
    const [wrong, setWrong] = useState(0);
    const [hearts, setHearts] = useState(LIVES);
    const [combo, setCombo] = useState(0);
    const [bestCombo, setBestCombo] = useState(0);
    const [firstTry, setFirstTry] = useState(0);
    const [wrongHazards, setWrongHazards] = useState<Set<string>>(new Set());
    const [selected, setSelected] = useState<Hazard | null>(null);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [timeLeft, setTimeLeft] = useState(TIME_TOTAL);
    const [outcome, setOutcome] = useState<GameOutcome | null>(null);
    const [lastResult, setLastResult] = useState<{
        score: number;
        stars: 0 | 1 | 2 | 3;
    }>({ score: 0, stars: 0 });
    const [webgl] = useState(() => supportsWebGL());
    const [listMode, setListMode] = useState(() => !webgl);
    const startedAt = useRef(0);
    const recorded = useRef(false);
    const selectedRef = useRef(selected);
    selectedRef.current = selected;

    const exit = useCallback(() => {
        void navigate({
            to: "/study/$subjectId/$section",
            params: { subjectId: subject.id, section: "games" },
            search: {},
        });
    }, [navigate, subject.id]);

    const start = useCallback(() => {
        const picked = shuffle(HAZARDS)
            .slice(0, ROUND_SIZE)
            .map((hazard) => ({
                ...hazard,
                options: shuffle(hazard.options),
            }));
        setRound(picked);
        setFound(new Set());
        setFixedObjects(new Set());
        setWrong(0);
        setHearts(LIVES);
        setCombo(0);
        setBestCombo(0);
        setFirstTry(0);
        setWrongHazards(new Set());
        setSelected(null);
        setFeedback(null);
        setTimeLeft(TIME_TOTAL);
        setOutcome(null);
        recorded.current = false;
        startedAt.current = Date.now();
        setPhase("playing");
    }, []);

    const finish = useCallback(
        (reason: "done" | "time" | "fail") => {
            if (recorded.current) return;
            recorded.current = true;
            const total = round.length || ROUND_SIZE;
            const scored = wardScore({
                found: found.size,
                total,
                firstTry,
                wrong,
                timeLeft,
            });
            const next = recordGame(progress, "ward-hazard", {
                ...scored,
                correct: found.size,
                total,
                durationMs: Date.now() - startedAt.current,
                combo: bestCombo,
                nearMiss: wrong,
                completed: reason === "done",
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
        },
        [
            bestCombo,
            firstTry,
            found,
            progress,
            round.length,
            timeLeft,
            update,
            wrong,
        ],
    );

    const finishRef = useRef(finish);
    finishRef.current = finish;

    useEffect(() => {
        if (phase !== "playing") return;
        const timer = window.setInterval(() => {
            if (selectedRef.current) return;
            setTimeLeft((left) => {
                if (left <= 1) {
                    window.clearInterval(timer);
                    window.setTimeout(() => finishRef.current("time"), 0);
                    return 0;
                }
                return left - 1;
            });
        }, 1000);
        return () => window.clearInterval(timer);
    }, [phase]);

    // 非隐患对象的提示 1.4 秒后自动消失
    useEffect(() => {
        if (!feedback || feedback.end || selected) return;
        const timer = window.setTimeout(() => {
            setFeedback((current) =>
                current && !current.end ? null : current,
            );
        }, 1400);
        return () => window.clearTimeout(timer);
    }, [feedback, selected]);

    const selectObject = (objectId: string) => {
        if (phase !== "playing" || selected || feedback) return;
        const hazard = round.find((item) => item.object === objectId);
        if (!hazard) {
            setFeedback({
                ok: true,
                text: "这里看起来没问题，再找找别处。",
                end: false,
            });
            return;
        }
        if (found.has(hazard.id)) {
            setFeedback({
                ok: true,
                text: `这处已经处理好了：${hazard.fix}`,
                end: false,
            });
            return;
        }
        setSelected(hazard);
        setFeedback(null);
    };

    const choose = (option: HazardOption) => {
        if (!selected) return;
        const hazard = selected;

        if (!option.ok) {
            const nextHearts = Math.max(0, hearts - 1);
            setWrong((value) => value + 1);
            setHearts(nextHearts);
            setCombo(0);
            setWrongHazards((current) => new Set(current).add(hazard.id));
            setFeedback({
                ok: false,
                text: option.why,
                end: nextHearts <= 0,
            });
            return;
        }

        const wasWrong = wrongHazards.has(hazard.id);
        const nextFound = new Set(found).add(hazard.id);
        const nextFixed = new Set(fixedObjects).add(hazard.object);
        setFound(nextFound);
        setFixedObjects(nextFixed);

        if (wasWrong) {
            setCombo(0);
        } else {
            const nextCombo = combo + 1;
            setFirstTry((value) => value + 1);
            setCombo(nextCombo);
            setBestCombo((value) => Math.max(value, nextCombo));
        }

        const allFound = nextFound.size >= round.length;
        setFeedback({
            ok: true,
            text: `${option.why} 处理：${hazard.fix}`,
            end: allFound,
        });
    };

    const closeFeedback = () => {
        if (!feedback) return;
        if (feedback.end) {
            finish(found.size >= round.length ? "done" : "fail");
            return;
        }
        setFeedback(null);
        setSelected(null);
    };

    if (phase === "result" && outcome) {
        return (
            <ResultPanel
                title="夜巡 · 病房安全巡查"
                subtitle="每一次巡查，都是在替患者挡一次伤害"
                score={lastResult.score}
                stars={lastResult.stars}
                xpGained={outcome.xpGained}
                isBest={outcome.isBest}
                unlocked={outcome.unlocked}
                unit="处"
                correct={found.size}
                total={round.length}
                gameId="ward-hazard"
                details={round.map((hazard) => ({
                    title: hazard.title,
                    ok: found.has(hazard.id),
                    note: found.has(hazard.id)
                        ? hazard.fix
                        : `正确做法：${hazard.fix}`,
                }))}
                onRetry={start}
                onExit={exit}
            />
        );
    }

    if (phase === "intro") {
        return (
            <div className="ward-intro">
                <div className="ward-intro-bg" aria-hidden="true">
                    {webgl && (
                        <WardScene
                            hazards={[]}
                            fixed={new Set()}
                            selected={null}
                            onSelect={() => undefined}
                        />
                    )}
                </div>
                <div className="ward-intro-card">
                    <div className="gi-kicker">3D 实战 · 护理质控</div>
                    <h1>夜巡</h1>
                    <p>
                        你是今晚的值班护士。病房里有 8 处会伤害患者的隐患，
                        转一圈，把它们找出来并改掉。
                    </p>
                    <ul>
                        <li>拖动旋转病房，点物品查看</li>
                        <li>选错会掉一颗心，3 颗心用完就下班</li>
                        <li>打开面板时计时暂停，可以慢慢想</li>
                    </ul>
                    <button className="g-btn primary lg" onClick={start}>
                        开始巡查
                    </button>
                    {listMode && (
                        <p className="gi-note">
                            当前设备不支持 WebGL，已切换到列表模式。
                        </p>
                    )}
                </div>
            </div>
        );
    }

    const listObjects = [
        ...Object.entries(SCENE_LABELS).map(([object, title]) => ({
            object,
            title,
        })),
        ...DECOYS,
    ];

    return (
        <div className="game-shell ward-game">
            <div className="game-topbar">
                <button className="g-back" onClick={exit} aria-label="返回病区">
                    ←
                </button>
                <div className="game-topbar-copy">
                    <b>夜巡</b>
                    <span>3D 病房找隐患</span>
                </div>
                <div className="ward-timer">
                    <span aria-hidden="true">⏱</span> {fmtTime(timeLeft)}
                </div>
            </div>

            <div className="ward-stage">
                <div className="ward-view">
                    {webgl && (
                        <WardScene
                            hazards={round}
                            fixed={fixedObjects}
                            selected={selected?.object ?? null}
                            onSelect={selectObject}
                            showChecks={!listMode}
                        />
                    )}
                    {listMode && (
                        <div
                            className="ward-list ward-list-overlay"
                            role="list"
                        >
                            {listObjects.map((item) => (
                                <button
                                    key={item.object}
                                    className="ward-list-item"
                                    onClick={() => selectObject(item.object)}
                                    disabled={Boolean(selected)}
                                >
                                    <span aria-hidden="true">🔍</span>
                                    {item.title}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="ward-hud">
                        <span className="ward-hud-chip">
                            🔎 {found.size}/{round.length}
                        </span>
                        <span className="ward-hud-chip hearts">
                            {Array.from({ length: LIVES }, (_, index) => (
                                <i
                                    key={index}
                                    className={index < hearts ? "on" : ""}
                                >
                                    ♥
                                </i>
                            ))}
                        </span>
                        <span className="ward-hud-chip">连击 {combo}</span>
                    </div>

                    {webgl && (
                        <button
                            className="ward-mode"
                            onClick={() => setListMode((value) => !value)}
                            aria-pressed={listMode}
                        >
                            {listMode ? "3D 视图" : "列表模式"}
                        </button>
                    )}

                    {feedback && !selected && (
                        <div
                            className={`ward-toast ${feedback.ok ? "ok" : "bad"}`}
                            role="status"
                        >
                            {feedback.text}
                        </div>
                    )}

                    {!selected && !feedback && (
                        <div className="ward-hint">
                            点击场景里的物品检查 · 找齐 8 处隐患
                        </div>
                    )}
                </div>

                {selected ? (
                    <div
                        className={`ward-panel ${
                            feedback ? (feedback.ok ? "ok" : "bad") : ""
                        }`}
                    >
                        <div className="ward-panel-head">
                            <span className="ward-panel-kicker">
                                {feedback
                                    ? feedback.ok
                                        ? "处理正确"
                                        : "存在风险"
                                    : "发现隐患"}
                            </span>
                            <b>{selected.title}</b>
                            <span className="ward-paused">计时暂停</span>
                        </div>
                        <p className="ward-prompt">{selected.prompt}</p>

                        {feedback ? (
                            <>
                                <div className="ward-why">{feedback.text}</div>
                                <div className="ward-source">
                                    依据：{selected.source}
                                </div>
                                <button
                                    className="g-btn primary"
                                    onClick={closeFeedback}
                                >
                                    {feedback.end ? "查看结算" : "继续巡查"}
                                </button>
                            </>
                        ) : (
                            <div className="ward-options">
                                {selected.options.map((option) => (
                                    <button
                                        key={option.text}
                                        className="ward-option"
                                        onClick={() => choose(option)}
                                    >
                                        {option.text}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="ward-tip">
                        找到隐患后，选择正确的处理方式。选错会掉一颗心。
                    </div>
                )}
            </div>
        </div>
    );
}
