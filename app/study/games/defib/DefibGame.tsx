import { useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";

import { useStudy } from "../../components/StudyContext";
import { shuffle } from "../../engine";
import { toast } from "../../toast";
import ResultPanel from "../components/ResultPanel";
import { type GameOutcome, recordGame } from "../meta";
import CprTrainer from "./CprTrainer";
import {
    type BodyZone,
    getLead,
    LEAD_DEFS,
    LEAD_ZONES,
    type LeadDef,
    type LeadId,
    PAD_TARGETS,
    PAD_ZONES,
    SHOCK_ORDER_LABEL,
    SHOCK_STEPS,
    type ShockStepId,
} from "./data";
import DefibScene, { supportsWebGL } from "./DefibScene";
// 通用实战样式（.g-btn / .game-loading 等）与本 lazy chunk 一起加载。
import "../games.css";
import "./defib.css";
import { GAME_ID } from "./meta";
import {
    DEFIB_CLEAN_TOTAL,
    defibScore,
    type DefibScoreResult,
    type RhythmResult,
} from "./scoring";

export {
    GAME_CARDS,
    GAME_DESC,
    GAME_ICON,
    GAME_ID,
    GAME_MINUTES,
    GAME_MODULES,
    GAME_SUBTITLE,
    GAME_TITLE,
} from "./meta";

type Phase = "intro" | "leads" | "pads" | "cpr" | "shock" | "result";

type Feedback = {
    ok: boolean;
    text: string;
};

type LeadMistakes = Record<LeadId, number>;
type PadToken = 1 | 2;

const PAD_TOKENS: PadToken[] = [1, 2];

const PHASE_STEPS = [
    { id: "leads", label: "导联" },
    { id: "pads", label: "电极" },
    { id: "cpr", label: "CPR" },
    { id: "shock", label: "除颤" },
] as const;

const PHASE_SUBTITLE: Record<Phase, string> = {
    intro: "",
    leads: "第 1 步 · 五色心电导联",
    pads: "第 2 步 · 除颤电极",
    cpr: "第 3 步 · 110 次/分",
    shock: "第 4 步 · 除颤顺序",
    result: "",
};

function makeLeadMistakes(): LeadMistakes {
    return { white: 0, black: 0, green: 0, red: 0, brown: 0 };
}

function wrongLeadText(lead: LeadDef, zone: BodyZone): string {
    const other = LEAD_DEFS.find((item) => item.targetZone === zone.id);
    if (other) {
        return `${zone.label}是${other.name}导联的位置；${lead.hint}`;
    }
    return `${zone.label}不是${lead.name}导联的定位点；${lead.hint}`;
}

export default function DefibGame() {
    const { subject, progress, update } = useStudy();
    const navigate = useNavigate();
    const [phase, setPhase] = useState<Phase>("intro");
    const [webgl] = useState(() => supportsWebGL());
    const [selectedLead, setSelectedLead] = useState<LeadId | null>(null);
    const [placedLeads, setPlacedLeads] = useState<Set<LeadId>>(new Set());
    const [leadMistakes, setLeadMistakes] =
        useState<LeadMistakes>(makeLeadMistakes);
    const [leadFeedback, setLeadFeedback] = useState<Feedback | null>(null);
    const [selectedPad, setSelectedPad] = useState<PadToken | null>(null);
    const [padPlaced, setPadPlaced] = useState<Record<PadToken, string | null>>(
        { 1: null, 2: null },
    );
    const [placedPadTargets, setPlacedPadTargets] = useState<Set<string>>(
        new Set(),
    );
    const [padMistakes, setPadMistakes] = useState(0);
    const [padFeedback, setPadFeedback] = useState<Feedback | null>(null);
    const [rhythm, setRhythm] = useState<RhythmResult | null>(null);
    const [shockActions, setShockActions] = useState(() =>
        shuffle(SHOCK_STEPS),
    );
    const [shockProgress, setShockProgress] = useState(0);
    const [shockMistakes, setShockMistakes] = useState(0);
    const [shockFeedback, setShockFeedback] = useState<Feedback | null>(null);
    const [outcome, setOutcome] = useState<GameOutcome | null>(null);
    const [scored, setScored] = useState<DefibScoreResult | null>(null);
    const startedAtRef = useRef(0);
    const recordedRef = useRef(false);

    const leadsDone = placedLeads.size >= LEAD_DEFS.length;
    const padsDone = placedPadTargets.size >= PAD_TARGETS.length;
    const shockDone = shockProgress >= SHOCK_STEPS.length;
    const leadMistakeTotal = LEAD_DEFS.reduce(
        (sum, lead) => sum + leadMistakes[lead.id],
        0,
    );
    const phaseIndex = PHASE_STEPS.findIndex((item) => item.id === phase);

    const exit = useCallback(() => {
        void navigate({
            to: "/study/$subjectId/$section",
            params: { subjectId: subject.id, section: "games" },
            search: {},
        });
    }, [navigate, subject.id]);

    const resetBoard = () => {
        setSelectedLead(null);
        setPlacedLeads(new Set());
        setLeadMistakes(makeLeadMistakes());
        setLeadFeedback(null);
        setSelectedPad(null);
        setPadPlaced({ 1: null, 2: null });
        setPlacedPadTargets(new Set());
        setPadMistakes(0);
        setPadFeedback(null);
        setRhythm(null);
        setShockActions(shuffle(SHOCK_STEPS));
        setShockProgress(0);
        setShockMistakes(0);
        setShockFeedback(null);
        setOutcome(null);
        setScored(null);
        recordedRef.current = false;
    };

    const start = () => {
        resetBoard();
        startedAtRef.current = Date.now();
        setPhase("leads");
    };

    const selectLead = (id: LeadId) => {
        if (leadsDone || placedLeads.has(id)) return;
        setSelectedLead(id);
        setLeadFeedback(null);
    };

    const pickLeadZone = (zoneId: string) => {
        if (phase !== "leads" || leadsDone) return;
        const lead = selectedLead ? getLead(selectedLead) : null;
        if (!lead) {
            setLeadFeedback({
                ok: false,
                text: "先从上方选择一枚导联，再点身体上的定位点。",
            });
            return;
        }
        if (placedLeads.has(lead.id)) {
            setLeadFeedback({
                ok: false,
                text: `${lead.name}导联已经贴好了，换一枚继续。`,
            });
            return;
        }
        const zone = LEAD_ZONES.find((item) => item.id === zoneId);
        if (!zone) return;

        if (zone.lead === lead.id) {
            const nextPlaced = new Set(placedLeads);
            nextPlaced.add(lead.id);
            setPlacedLeads(nextPlaced);
            setLeadFeedback({
                ok: true,
                text: `${lead.name}导联已贴在${zone.label}。`,
            });
            const nextLead =
                LEAD_DEFS.find((item) => !nextPlaced.has(item.id)) ?? null;
            setSelectedLead(nextLead ? nextLead.id : null);
            return;
        }

        setLeadMistakes((current) => ({
            ...current,
            [lead.id]: current[lead.id] + 1,
        }));
        setLeadFeedback({ ok: false, text: wrongLeadText(lead, zone) });
    };

    const selectPad = (token: PadToken) => {
        if (padsDone || padPlaced[token]) return;
        setSelectedPad(token);
        setPadFeedback(null);
    };

    const pickPadZone = (zoneId: string) => {
        if (phase !== "pads" || padsDone) return;
        if (selectedPad === null) {
            setPadFeedback({
                ok: false,
                text: "先在上方拿起一片电极片，再选择贴放位置。",
            });
            return;
        }

        const token = selectedPad;
        const zone = PAD_ZONES.find((item) => item.id === zoneId);
        if (!zone) return;
        const target = PAD_TARGETS.find((item) => item.id === zoneId);

        if (target && !placedPadTargets.has(zoneId)) {
            const nextTargets = new Set(placedPadTargets);
            nextTargets.add(zoneId);
            const nextPlaced: Record<PadToken, string | null> = {
                ...padPlaced,
                [token]: zoneId,
            };
            setPlacedPadTargets(nextTargets);
            setPadPlaced(nextPlaced);
            setPadFeedback({
                ok: true,
                text: `电极片已贴在${target.label}。`,
            });
            const other: PadToken = token === 1 ? 2 : 1;
            setSelectedPad(nextPlaced[other] ? null : other);
            return;
        }

        setPadMistakes((value) => value + 1);
        if (target) {
            setPadFeedback({
                ok: false,
                text: `${target.label}已经贴过一片了，另一片请贴到另一个位置。`,
            });
            return;
        }
        setPadFeedback({
            ok: false,
            text: `${zone.label}不是除颤电极的位置。两片电极应分别贴在右锁骨中线第 2 肋间和左腋前线第 5 肋间。`,
        });
    };

    const handleCprComplete = (result: RhythmResult) => {
        setRhythm(result);
        setShockProgress(0);
        setShockFeedback(null);
        setPhase("shock");
    };

    const pickShock = (actionId: ShockStepId) => {
        if (shockDone) return;
        const expected = SHOCK_STEPS[shockProgress];
        if (actionId === expected.id) {
            setShockProgress((value) => value + 1);
            setShockFeedback({
                ok: true,
                text: `${expected.label}：${expected.detail}。`,
            });
            return;
        }
        setShockMistakes((value) => value + 1);
        setShockProgress(0);
        setShockFeedback({
            ok: false,
            text: `顺序不对，已重置。第一步应先${SHOCK_STEPS[0].label}。`,
        });
    };

    const finish = () => {
        if (recordedRef.current || !rhythm) return;
        recordedRef.current = true;

        const cleanLeads = LEAD_DEFS.filter(
            (lead) => placedLeads.has(lead.id) && leadMistakes[lead.id] === 0,
        ).length;
        const cleanPads = padMistakes === 0 ? placedPadTargets.size : 0;
        const sequenceOk = shockProgress >= SHOCK_STEPS.length;
        const scoredResult = defibScore({
            leadsClean: cleanLeads,
            padsClean: cleanPads,
            rhythmAccuracy: rhythm.accuracy,
            rhythmQuality: rhythm.quality,
            sequenceMistakes: shockMistakes,
            sequenceCompleted: sequenceOk,
            completed: true,
        });
        const cleanTotal =
            cleanLeads +
            cleanPads +
            (rhythm.accuracy >= 0.7 ? 1 : 0) +
            (sequenceOk && shockMistakes === 0 ? 1 : 0);

        const next = recordGame(progress, GAME_ID, {
            score: scoredResult.score,
            stars: scoredResult.stars,
            correct: cleanTotal,
            total: DEFIB_CLEAN_TOTAL,
            durationMs: Math.max(1000, Date.now() - startedAtRef.current),
            nearMiss: leadMistakeTotal + padMistakes + shockMistakes,
            completed: true,
        });
        update(() => next.progress);
        setScored(scoredResult);
        setOutcome(next);
        setPhase("result");
        if (next.unlocked.length) {
            toast(
                `解锁徽章：${next.unlocked
                    .map((badge) => badge.name)
                    .join("、")}`,
            );
        }
    };

    if (phase === "result" && outcome && scored) {
        const cleanLeads = LEAD_DEFS.filter(
            (lead) => placedLeads.has(lead.id) && leadMistakes[lead.id] === 0,
        ).length;
        const cleanPads = padMistakes === 0 ? placedPadTargets.size : 0;
        const rhythmOk = Boolean(rhythm && rhythm.accuracy >= 0.7);
        const sequenceOk =
            shockMistakes === 0 && shockProgress >= SHOCK_STEPS.length;
        const correct =
            cleanLeads + cleanPads + (rhythmOk ? 1 : 0) + (sequenceOk ? 1 : 0);
        const details = [
            ...LEAD_DEFS.map((lead) => {
                const misses = leadMistakes[lead.id];
                return {
                    title: `${lead.name}导联 · ${lead.targetLabel}`,
                    ok: placedLeads.has(lead.id) && misses === 0,
                    note:
                        misses > 0
                            ? `纠错 ${misses} 次；正确位置：${lead.targetLabel}`
                            : lead.hint,
                };
            }),
            ...PAD_TARGETS.map((target) => ({
                title: `除颤电极 · ${target.label}`,
                ok: placedPadTargets.has(target.id) && padMistakes === 0,
                note:
                    padMistakes > 0
                        ? `本阶段纠错 ${padMistakes} 次；正确位置：${target.label}`
                        : "一次到位",
            })),
            {
                title: "CPR 节律 · 110 次/分",
                ok: rhythmOk,
                note: rhythm
                    ? `完美 ${rhythm.perfect} · 良好 ${rhythm.good} · 失误 ${rhythm.miss} · 准确率 ${Math.round(
                          rhythm.accuracy * 100,
                      )}%${
                          rhythm.extra ? ` · 多余按压 ${rhythm.extra} 次` : ""
                      }`
                    : "未完成节律阶段",
            },
            {
                title: "除颤三步顺序",
                ok: sequenceOk,
                note: sequenceOk
                    ? `${SHOCK_ORDER_LABEL}，顺序正确`
                    : `顺序错误 ${shockMistakes} 次；正确顺序：${SHOCK_ORDER_LABEL}`,
            },
        ];

        return (
            <div className="defib-root">
                <ResultPanel
                    title="除颤时刻 · 抢救室"
                    subtitle="每一次按压，都是在把心跳抢回来"
                    gameId="defib"
                    score={scored.score}
                    stars={scored.stars}
                    xpGained={outcome.xpGained}
                    isBest={outcome.isBest}
                    unlocked={outcome.unlocked}
                    unit="项"
                    correct={correct}
                    total={DEFIB_CLEAN_TOTAL}
                    details={details}
                    onRetry={start}
                    onExit={exit}
                />
            </div>
        );
    }

    if (phase === "intro") {
        return (
            <div className="defib-root defib-intro">
                <div className="defib-intro-glow" aria-hidden="true" />
                <div className="defib-intro-card">
                    <div className="defib-kicker">3D 抢救 · 心电与除颤</div>
                    <h1>除颤时刻</h1>
                    <p>
                        一位患者突发室颤。先接好心电监护，再贴除颤电极， 用 110
                        次/分的高质量按压撑住循环，最后按顺序除颤。
                    </p>
                    <ol className="defib-intro-steps">
                        <li>
                            <span aria-hidden="true">1</span>
                            <div>
                                <b>五色导联</b>
                                <small>白、黑、绿、红、棕各就各位</small>
                            </div>
                        </li>
                        <li>
                            <span aria-hidden="true">2</span>
                            <div>
                                <b>除颤电极</b>
                                <small>右二左五，两片电极贴对位置</small>
                            </div>
                        </li>
                        <li>
                            <span aria-hidden="true">3</span>
                            <div>
                                <b>CPR 节律</b>
                                <small>30 秒，110 次/分，踩准每一拍</small>
                            </div>
                        </li>
                        <li>
                            <span aria-hidden="true">4</span>
                            <div>
                                <b>除颤顺序</b>
                                <small>充电、清场、放电，一步不能乱</small>
                            </div>
                        </li>
                    </ol>
                    <button
                        type="button"
                        className="g-btn primary lg"
                        onClick={start}
                    >
                        进入抢救
                    </button>
                    <p className="defib-intro-note">
                        约 4 分钟 · 3D 模型可拖动旋转 · 键盘也能完成全部操作
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="defib-root game-shell defib-game">
            <div className="game-topbar">
                <button
                    type="button"
                    className="g-back"
                    onClick={exit}
                    aria-label="返回小游戏"
                >
                    ←
                </button>
                <div className="game-topbar-copy">
                    <b>除颤时刻</b>
                    <span>{PHASE_SUBTITLE[phase]}</span>
                </div>
                <div className="defib-count">
                    {phase === "leads" && `导联 ${placedLeads.size}/5`}
                    {phase === "pads" && `电极 ${placedPadTargets.size}/2`}
                    {phase === "cpr" && "30 秒"}
                    {phase === "shock" && `除颤 ${shockProgress}/3`}
                </div>
            </div>

            <ol className="defib-phasebar" aria-label="抢救流程">
                {PHASE_STEPS.map((item, index) => (
                    <li
                        key={item.id}
                        className={`defib-phase ${
                            index < phaseIndex ? "done" : ""
                        } ${index === phaseIndex ? "on" : ""}`}
                        aria-current={index === phaseIndex ? "step" : undefined}
                    >
                        <span aria-hidden="true">
                            {index < phaseIndex ? "✓" : index + 1}
                        </span>
                        {item.label}
                    </li>
                ))}
            </ol>

            {phase === "leads" && (
                <div className="defib-stage">
                    <div
                        className="defib-canvas-box"
                        role="group"
                        aria-label="3D 人体模型，可拖动旋转并点击体表定位点"
                        aria-describedby="defib-instruction"
                    >
                        {webgl ? (
                            <DefibScene
                                mode="leads"
                                placedLeads={placedLeads}
                                placedPads={placedPadTargets}
                                onPickZone={pickLeadZone}
                            />
                        ) : (
                            <div className="defib-no3d">
                                当前设备不支持 3D
                                显示，请直接使用下方的体表定位点按钮。
                            </div>
                        )}
                        <span className="defib-scene-badge">
                            已贴 {placedLeads.size}/5
                        </span>
                        {webgl && (
                            <span className="defib-scene-hint">
                                拖动旋转 · 点定位点
                            </span>
                        )}
                    </div>

                    <p className="defib-instruction" id="defib-instruction">
                        先选择一枚导联，再点身体上的定位点。左右是患者的左右；
                        可以拖动模型旋转，也可以直接使用下方的定位点按钮。
                    </p>

                    <div
                        className="defib-tray"
                        role="group"
                        aria-label="选择导联颜色"
                    >
                        {LEAD_DEFS.map((lead) => {
                            const done = placedLeads.has(lead.id);
                            return (
                                <button
                                    key={lead.id}
                                    type="button"
                                    className={`defib-tray-btn ${
                                        selectedLead === lead.id ? "on" : ""
                                    } ${done ? "done" : ""}`}
                                    onClick={() => selectLead(lead.id)}
                                    disabled={done || leadsDone}
                                    aria-pressed={selectedLead === lead.id}
                                    aria-label={`${lead.name}导联 ${lead.code}${
                                        done ? "，已放置" : ""
                                    }`}
                                >
                                    <span
                                        className="defib-swatch"
                                        style={{
                                            backgroundColor: lead.color,
                                        }}
                                        aria-hidden="true"
                                    />
                                    <span className="defib-tray-name">
                                        {lead.name}
                                    </span>
                                    <small>{lead.code}</small>
                                    {done && (
                                        <span
                                            className="defib-tray-check"
                                            aria-hidden="true"
                                        >
                                            ✓
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <div
                        className={`defib-feedback-slot ${
                            leadFeedback ? (leadFeedback.ok ? "ok" : "bad") : ""
                        }`}
                        role="status"
                        aria-live="polite"
                    >
                        {leadFeedback ? (
                            <div
                                className={`defib-feedback ${
                                    leadFeedback.ok ? "ok" : "bad"
                                }`}
                            >
                                <b>{leadFeedback.ok ? "贴好了" : "位置不对"}</b>
                                <span>{leadFeedback.text}</span>
                            </div>
                        ) : (
                            <span className="defib-feedback-idle">
                                {leadsDone
                                    ? "五色导联全部贴好，可以进入下一步。"
                                    : selectedLead
                                      ? `已选${getLead(selectedLead).name}导联，请点身体上的定位点。`
                                      : "先选择一枚导联。"}
                            </span>
                        )}
                    </div>

                    <div
                        className="defib-zones"
                        role="group"
                        aria-label="体表定位点"
                    >
                        {LEAD_ZONES.map((zone) => {
                            const done = Boolean(
                                zone.lead && placedLeads.has(zone.lead),
                            );
                            return (
                                <button
                                    key={zone.id}
                                    type="button"
                                    className={`defib-zone-btn ${
                                        done ? "done" : ""
                                    }`}
                                    onClick={() => pickLeadZone(zone.id)}
                                    disabled={done || leadsDone}
                                    aria-label={`${zone.label}${
                                        done ? "，已放置" : ""
                                    }`}
                                >
                                    {zone.label}
                                    {done ? " ✓" : ""}
                                </button>
                            );
                        })}
                    </div>
                    <p className="defib-zone-note">
                        体表定位点按钮与 3D 模型同步，不方便看模型时可直接使用。
                    </p>

                    {leadsDone && (
                        <div className="defib-next-row">
                            <button
                                type="button"
                                className="g-btn primary lg"
                                onClick={() => {
                                    setPadFeedback(null);
                                    setPhase("pads");
                                }}
                            >
                                贴除颤电极 →
                            </button>
                        </div>
                    )}
                </div>
            )}

            {phase === "pads" && (
                <div className="defib-stage">
                    <div
                        className="defib-canvas-box"
                        role="group"
                        aria-label="3D 人体模型，可拖动旋转并点击体表定位点"
                        aria-describedby="defib-instruction"
                    >
                        {webgl ? (
                            <DefibScene
                                mode="pads"
                                placedLeads={placedLeads}
                                placedPads={placedPadTargets}
                                onPickZone={pickPadZone}
                            />
                        ) : (
                            <div className="defib-no3d">
                                当前设备不支持 3D
                                显示，请直接使用下方的体表定位点按钮。
                            </div>
                        )}
                        <span className="defib-scene-badge">
                            已贴 {placedPadTargets.size}/2
                        </span>
                        {webgl && (
                            <span className="defib-scene-hint">
                                拖动旋转 · 点定位点
                            </span>
                        )}
                    </div>

                    <p className="defib-instruction" id="defib-instruction">
                        把两片电极分别贴在右锁骨中线第 2 肋间、 左腋前线第 5
                        肋间。先拿起一片电极片，再点身体位置。
                    </p>

                    <div
                        className="defib-tray defib-pad-tray"
                        role="group"
                        aria-label="除颤电极片"
                    >
                        {PAD_TOKENS.map((token) => {
                            const done = Boolean(padPlaced[token]);
                            return (
                                <button
                                    key={token}
                                    type="button"
                                    className={`defib-tray-btn pad ${
                                        selectedPad === token ? "on" : ""
                                    } ${done ? "done" : ""}`}
                                    onClick={() => selectPad(token)}
                                    disabled={done || padsDone}
                                    aria-pressed={selectedPad === token}
                                    aria-label={`电极片 ${
                                        token === 1 ? "A" : "B"
                                    }${done ? "，已放置" : ""}`}
                                >
                                    <span
                                        className="defib-pad-icon"
                                        aria-hidden="true"
                                    >
                                        ▣
                                    </span>
                                    <span className="defib-tray-name">
                                        电极片 {token === 1 ? "A" : "B"}
                                    </span>
                                    {done ? (
                                        <span
                                            className="defib-tray-check"
                                            aria-hidden="true"
                                        >
                                            ✓
                                        </span>
                                    ) : (
                                        <small>待贴</small>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <div
                        className={`defib-feedback-slot ${
                            padFeedback ? (padFeedback.ok ? "ok" : "bad") : ""
                        }`}
                        role="status"
                        aria-live="polite"
                    >
                        {padFeedback ? (
                            <div
                                className={`defib-feedback ${
                                    padFeedback.ok ? "ok" : "bad"
                                }`}
                            >
                                <b>{padFeedback.ok ? "贴好了" : "位置不对"}</b>
                                <span>{padFeedback.text}</span>
                            </div>
                        ) : (
                            <span className="defib-feedback-idle">
                                {padsDone
                                    ? "两片电极都贴好了，可以开始 CPR。"
                                    : selectedPad
                                      ? `已拿起电极片 ${
                                            selectedPad === 1 ? "A" : "B"
                                        }，请点身体位置。`
                                      : "先拿起一片电极片。"}
                            </span>
                        )}
                    </div>

                    <div
                        className="defib-zones"
                        role="group"
                        aria-label="体表定位点"
                    >
                        {PAD_ZONES.map((zone) => {
                            const done = placedPadTargets.has(zone.id);
                            return (
                                <button
                                    key={zone.id}
                                    type="button"
                                    className={`defib-zone-btn ${
                                        done ? "done" : ""
                                    }`}
                                    onClick={() => pickPadZone(zone.id)}
                                    disabled={done || padsDone}
                                    aria-label={`${zone.label}${
                                        done ? "，已放置" : ""
                                    }`}
                                >
                                    {zone.label}
                                    {done ? " ✓" : ""}
                                </button>
                            );
                        })}
                    </div>
                    <p className="defib-zone-note">
                        体表定位点按钮与 3D 模型同步，不方便看模型时可直接使用。
                    </p>

                    {padsDone && (
                        <div className="defib-next-row">
                            <button
                                type="button"
                                className="g-btn primary lg"
                                onClick={() => setPhase("cpr")}
                            >
                                开始 CPR →
                            </button>
                        </div>
                    )}
                </div>
            )}

            {phase === "cpr" && (
                <div className="defib-stage">
                    <p className="defib-instruction" id="defib-instruction">
                        跟着节拍，以 110 次/分按压 30 秒。点击大按钮或按空格键，
                        尽量落在每个节拍的正中。
                    </p>
                    <CprTrainer onComplete={handleCprComplete} />
                </div>
            )}

            {phase === "shock" && (
                <div className="defib-stage">
                    <p className="defib-instruction" id="defib-instruction">
                        按正确的抢救顺序完成三步除颤操作。顺序错误会重置，
                        请从头再来一次。
                    </p>

                    <div className="defib-shock">
                        <div
                            className="defib-shock-slots"
                            aria-label={`已完成 ${shockProgress}/3 步`}
                        >
                            {SHOCK_STEPS.map((step, index) => (
                                <div
                                    key={step.id}
                                    className={`defib-shock-slot ${
                                        index < shockProgress ? "done" : ""
                                    } ${
                                        index === shockProgress && !shockDone
                                            ? "on"
                                            : ""
                                    }`}
                                >
                                    <span aria-hidden="true">
                                        {index < shockProgress
                                            ? "✓"
                                            : index + 1}
                                    </span>
                                    <small>
                                        {index < shockProgress
                                            ? step.label
                                            : "待完成"}
                                    </small>
                                </div>
                            ))}
                        </div>

                        <div className="defib-shock-list">
                            {shockActions.map((action) => (
                                <button
                                    key={action.id}
                                    type="button"
                                    className="defib-shock-btn"
                                    onClick={() => pickShock(action.id)}
                                    disabled={shockDone}
                                >
                                    <b>{action.label}</b>
                                    <span>{action.detail}</span>
                                </button>
                            ))}
                        </div>

                        <div
                            className={`defib-feedback-slot ${
                                shockFeedback
                                    ? shockFeedback.ok
                                        ? "ok"
                                        : "bad"
                                    : ""
                            }`}
                            role="status"
                            aria-live="polite"
                        >
                            {shockFeedback ? (
                                <div
                                    className={`defib-feedback ${
                                        shockFeedback.ok ? "ok" : "bad"
                                    }`}
                                >
                                    <b>
                                        {shockFeedback.ok
                                            ? "顺序正确"
                                            : "顺序不对"}
                                    </b>
                                    <span>{shockFeedback.text}</span>
                                </div>
                            ) : (
                                <span className="defib-feedback-idle">
                                    按抢救流程选择下一步操作。
                                </span>
                            )}
                        </div>

                        {shockDone && (
                            <div className="defib-next-row">
                                <button
                                    type="button"
                                    className="g-btn primary lg"
                                    onClick={finish}
                                >
                                    查看结算 →
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
