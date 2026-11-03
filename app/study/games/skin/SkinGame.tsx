import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useStudy } from "../../components/StudyContext";
import { shuffle } from "../../engine";
import { toast } from "../../toast";
import ResultPanel from "../components/ResultPanel";
import { recordGame, type GameOutcome } from "../meta";
import SkinScene, { type SceneView } from "./SkinScene";
import {
    BASE_TISSUE_COLORS,
    SKIN_LAYERS,
    SKIN_TOP,
    type WoundProfile,
} from "./anatomy";
import {
    SKIN_CASES,
    STAGE_LABELS,
    STAGE_OPTIONS,
    TREATMENTS,
    stageOption,
    type SkinCase,
    type StageKey,
    type TreatmentId,
} from "./cases";
import { casePoints, scoreSkinRun, type SkinScore } from "./scoring";
import "./skin.css";

export const GAME_ID = "skin";
export const GAME_TITLE = "皮肤之下";
export const GAME_SUBTITLE = "3D 压疮分层与分期";
export const GAME_ICON = "🔬";
export const GAME_MINUTES = 5;
export const GAME_DESC =
    "转动一块 3D 皮肤剖面，看清表皮、真皮、脂肪、肌肉和骨面，完成 6 个压疮病例的分期与处理。";
export const GAME_MODULES = ["m2"];
export const GAME_CARDS = ["c11", "c13"];

type Phase = "intro" | "playing" | "result";

type CaseResult = {
    caseId: string;
    stage: StageKey;
    treatment: TreatmentId;
    stageOk: boolean;
    treatmentOk: boolean;
};

const VIEW_OPTIONS: { id: SceneView; label: string }[] = [
    { id: "iso", label: "等距" },
    { id: "side", label: "侧面" },
    { id: "top", label: "俯视" },
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

export default function SkinGame() {
    const { subject, progress, update } = useStudy();
    const navigate = useNavigate();
    const [phase, setPhase] = useState<Phase>("intro");
    const [index, setIndex] = useState(0);
    const [stageChoice, setStageChoice] = useState<StageKey | null>(null);
    const [treatmentChoice, setTreatmentChoice] = useState<TreatmentId | null>(
        null,
    );
    const [order, setOrder] = useState<TreatmentId[]>(() =>
        shuffle(SKIN_CASES[0].treatmentOptions),
    );
    const [revealed, setRevealed] = useState(false);
    const [probe, setProbe] = useState(false);
    const [view, setView] = useState<SceneView>("iso");
    const [results, setResults] = useState<CaseResult[]>([]);
    const [outcome, setOutcome] = useState<GameOutcome | null>(null);
    const [runScore, setRunScore] = useState<SkinScore | null>(null);
    const [webgl] = useState(() => supportsWebGL());
    const startedAt = useRef(0);
    const recorded = useRef(false);
    const locked = useRef(false);
    const feedbackRef = useRef<HTMLDivElement>(null);

    const currentCase = SKIN_CASES[index] ?? SKIN_CASES[0];
    const caseResult = results.find((item) => item.caseId === currentCase.id);

    const exit = useCallback(() => {
        void navigate({
            to: "/study/$subjectId/$section",
            params: { subjectId: subject.id, section: "games" },
            search: {},
        });
    }, [navigate, subject.id]);

    const start = useCallback(() => {
        recorded.current = false;
        locked.current = false;
        startedAt.current = Date.now();
        setIndex(0);
        setStageChoice(null);
        setTreatmentChoice(null);
        setRevealed(false);
        setProbe(false);
        setView("iso");
        setResults([]);
        setOutcome(null);
        setRunScore(null);
        setOrder(shuffle(SKIN_CASES[0].treatmentOptions));
        setPhase("playing");
    }, []);

    const confirm = () => {
        if (locked.current || !stageChoice || !treatmentChoice) return;
        locked.current = true;
        setResults((current) => [
            ...current,
            {
                caseId: currentCase.id,
                stage: stageChoice,
                treatment: treatmentChoice,
                stageOk: stageChoice === currentCase.stage,
                treatmentOk: treatmentChoice === currentCase.correctTreatment,
            },
        ]);
        setRevealed(true);
    };

    const finish = useCallback(() => {
        if (recorded.current) return;
        if (results.length < SKIN_CASES.length) return;
        recorded.current = true;
        const scored = scoreSkinRun(
            results.map((item) => ({
                stageOk: item.stageOk,
                treatmentOk: item.treatmentOk,
            })),
        );
        const next = recordGame(progress, GAME_ID, {
            score: scored.score,
            stars: scored.stars,
            correct: scored.stageCorrect + scored.treatmentCorrect,
            total: SKIN_CASES.length * 2,
            durationMs: Date.now() - startedAt.current,
            completed: true,
        });
        update(() => next.progress);
        setOutcome(next);
        setRunScore(scored);
        setPhase("result");
        if (next.unlocked.length) {
            toast(
                `解锁徽章：${next.unlocked
                    .map((badge) => badge.name)
                    .join("、")}`,
            );
        }
    }, [progress, results, update]);

    const next = () => {
        if (index + 1 >= SKIN_CASES.length) {
            finish();
            return;
        }
        const nextIndex = index + 1;
        locked.current = false;
        setIndex(nextIndex);
        setStageChoice(null);
        setTreatmentChoice(null);
        setRevealed(false);
        setProbe(false);
        setView("iso");
        setOrder(shuffle(SKIN_CASES[nextIndex].treatmentOptions));
    };

    useEffect(() => {
        if (!revealed) return;
        const node = feedbackRef.current;
        if (!node) return;
        const reduce = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;
        node.scrollIntoView({
            behavior: reduce ? "auto" : "smooth",
            block: "nearest",
        });
    }, [revealed, index]);

    if (phase === "result" && outcome && runScore) {
        const details = SKIN_CASES.map((item, itemIndex) => {
            const result = results.find((entry) => entry.caseId === item.id);
            if (!result) {
                return {
                    title: `病例 ${itemIndex + 1} · ${item.title}`,
                    ok: false,
                    note: "未作答",
                };
            }
            const stageNote = result.stageOk
                ? `分期 ${STAGE_LABELS[result.stage]} ✓`
                : `分期 ${STAGE_LABELS[result.stage]} ×，应为 ${STAGE_LABELS[item.stage]}`;
            const treatmentNote = result.treatmentOk
                ? `处理 ${TREATMENTS[result.treatment].short} ✓`
                : `处理 ${TREATMENTS[result.treatment].short} ×，应为 ${TREATMENTS[item.correctTreatment].short}`;
            return {
                title: `病例 ${itemIndex + 1} · ${item.title}`,
                ok: result.stageOk && result.treatmentOk,
                note: `${stageNote}；${treatmentNote}`,
            };
        });

        return (
            <div className="skin-game skin-result-wrap">
                <ResultPanel
                    title="皮肤之下 · 压疮分期"
                    subtitle="先看分层，再定分期；处理要跟着创面走"
                    gameId={GAME_ID}
                    score={runScore.score}
                    stars={runScore.stars}
                    xpGained={outcome.xpGained}
                    isBest={outcome.isBest}
                    unlocked={outcome.unlocked}
                    unit="项"
                    correct={runScore.stageCorrect + runScore.treatmentCorrect}
                    total={SKIN_CASES.length * 2}
                    details={details}
                    onRetry={start}
                    onExit={exit}
                />
            </div>
        );
    }

    if (phase === "intro") {
        return (
            <div className="skin-game">
                <div className="skin-intro">
                    <div className="skin-intro-bg" aria-hidden="true">
                        {webgl && (
                            <SkinScene
                                wound={SKIN_CASES[2].wound}
                                probe={false}
                                controls={false}
                            />
                        )}
                    </div>
                    <div className="skin-intro-card">
                        <div className="skin-kicker">
                            3D 皮肤剖面 · 压疮分期
                        </div>
                        <h1>皮肤之下</h1>
                        <p>
                            六位患者，六种伤口。先转动 3D
                            皮肤剖面看清缺损到了哪一层，再判断压疮分期和处理方案。
                        </p>
                        <ul>
                            <li>拖动旋转，用「等距 / 侧面 / 俯视」切换视角</li>
                            <li>
                                点「探针探查」读取创底组织；皮肤完整或焦痂覆盖时，探针会停在上方并给出提示
                            </li>
                            <li>每例分期 50 分、处理 50 分，共 6 例</li>
                        </ul>
                        <button className="skin-btn primary lg" onClick={start}>
                            开始分期
                        </button>
                        {!webgl && (
                            <p className="skin-intro-note">
                                当前设备不支持 WebGL，已切换为剖面示意图。
                            </p>
                        )}
                        <p className="skin-intro-note">
                            全部为教学模拟，临床执行以医院制度为准。
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const displayedTreatments = order.map((id) => TREATMENTS[id]);

    return (
        <div className="skin-game">
            <header className="skin-topbar">
                <button
                    className="skin-back"
                    onClick={exit}
                    aria-label="返回实战大厅"
                >
                    ←
                </button>
                <div className="skin-title">
                    <b>皮肤之下</b>
                    <span>3D 压疮分层与分期</span>
                </div>
                <span className="skin-count">
                    病例 {index + 1} / {SKIN_CASES.length}
                </span>
            </header>

            <div className="skin-view" role="group" aria-label="3D 皮肤剖面">
                {webgl ? (
                    <SkinScene
                        wound={currentCase.wound}
                        probe={probe}
                        view={view}
                    />
                ) : (
                    <FlatSkin wound={currentCase.wound} />
                )}
                <div className="skin-hud">
                    <span className="skin-chip">{currentCase.region}</span>
                    <span className="skin-chip accent">
                        {webgl ? "3D 皮肤剖面" : "剖面示意图"}
                    </span>
                </div>
            </div>

            <div className="skin-tools">
                {webgl ? (
                    <div
                        className="skin-view-tabs"
                        role="group"
                        aria-label="3D 视角"
                    >
                        {VIEW_OPTIONS.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                className="skin-view-tab"
                                aria-pressed={view === option.id}
                                onClick={() => setView(option.id)}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                ) : (
                    <span className="skin-view-note">
                        WebGL 不可用 · 剖面示意图
                    </span>
                )}
                <button
                    type="button"
                    className="skin-probe-btn"
                    aria-pressed={probe}
                    onClick={() => setProbe((value) => !value)}
                >
                    <span aria-hidden="true">🔎</span>
                    {probe ? "收起探针" : "探针探查"}
                </button>
            </div>

            <div
                className={`skin-probe-readout ${probe ? "on" : ""}`}
                role="status"
            >
                <span className="skin-probe-kicker">探针读数</span>
                <b>{probe ? currentCase.probe.tissue : "尚未探查"}</b>
                <span>
                    {probe
                        ? currentCase.probe.note
                        : "点「探针探查」，把探针送到创面底部，读取最深处的组织。"}
                </span>
                <span className="skin-probe-depth">
                    {probe
                        ? `创底：${currentCase.probe.depth}`
                        : "创底深度：待探查"}
                </span>
            </div>

            <LayerLegend />
            <DepthMeter wound={currentCase.wound} probed={probe} />

            <section className="skin-case" aria-labelledby="skin-case-title">
                <div className="skin-case-top">
                    <span className="skin-case-region">
                        {currentCase.region}
                    </span>
                    <span className="skin-case-index">病例 {index + 1}</span>
                </div>
                <h2 id="skin-case-title">{currentCase.title}</h2>
                <p>{currentCase.scenario}</p>
                <div className="skin-observe">
                    <span>3D 观察</span>
                    <p>{currentCase.visual}</p>
                </div>
            </section>

            <section className="skin-answers" aria-label="作答">
                <fieldset className="skin-fieldset" disabled={revealed}>
                    <legend>① 判断分期</legend>
                    <div className="skin-stage-grid">
                        {STAGE_OPTIONS.map((option) => {
                            const chosen = stageChoice === option.key;
                            const correct = option.key === currentCase.stage;
                            const state = revealed
                                ? correct
                                    ? "correct"
                                    : chosen
                                      ? "wrong"
                                      : ""
                                : "";
                            return (
                                <button
                                    key={option.key}
                                    type="button"
                                    className={`skin-option ${state}`.trim()}
                                    aria-pressed={chosen}
                                    onClick={() => setStageChoice(option.key)}
                                >
                                    <span className="skin-option-head">
                                        <span>{option.label}</span>
                                        {revealed && correct && (
                                            <span className="skin-option-mark">
                                                正确答案
                                            </span>
                                        )}
                                        {revealed && !correct && chosen && (
                                            <span className="skin-option-mark bad">
                                                你的选择
                                            </span>
                                        )}
                                        {!revealed && chosen && (
                                            <span className="skin-option-mark">
                                                已选
                                            </span>
                                        )}
                                    </span>
                                    <span className="skin-option-hint">
                                        {option.hint}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </fieldset>

                <fieldset className="skin-fieldset" disabled={revealed}>
                    <legend>② 选择处理（TIMES）</legend>
                    <p className="skin-times">
                        TIMES：T 清创 · I 控制感染 · M 管理渗液 · E 保护创缘 · S
                        支持治疗
                    </p>
                    <div className="skin-treatment-list">
                        {displayedTreatments.map((treatment) => {
                            const chosen = treatmentChoice === treatment.id;
                            const correct =
                                treatment.id === currentCase.correctTreatment;
                            const state = revealed
                                ? correct
                                    ? "correct"
                                    : chosen
                                      ? "wrong"
                                      : ""
                                : "";
                            return (
                                <button
                                    key={treatment.id}
                                    type="button"
                                    className={`skin-option skin-treatment-option ${state}`.trim()}
                                    aria-pressed={chosen}
                                    onClick={() =>
                                        setTreatmentChoice(treatment.id)
                                    }
                                >
                                    <span className="skin-option-head">
                                        <span>{treatment.text}</span>
                                        {revealed && correct && (
                                            <span className="skin-option-mark">
                                                正确答案
                                            </span>
                                        )}
                                        {revealed && !correct && chosen && (
                                            <span className="skin-option-mark bad">
                                                你的选择
                                            </span>
                                        )}
                                        {!revealed && chosen && (
                                            <span className="skin-option-mark">
                                                已选
                                            </span>
                                        )}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </fieldset>
            </section>

            {!revealed && (
                <div className="skin-confirm-row">
                    <button
                        type="button"
                        className="skin-btn primary lg"
                        onClick={confirm}
                        disabled={!stageChoice || !treatmentChoice}
                    >
                        确认判断
                    </button>
                    <span className="skin-confirm-hint">
                        {stageChoice && treatmentChoice
                            ? "确认后显示依据，不能修改本题。"
                            : "先选分期，再选处理；两项都选了才能确认。"}
                    </span>
                </div>
            )}

            {revealed && caseResult && (
                <div ref={feedbackRef} className="skin-feedback-anchor">
                    <CaseFeedback
                        item={currentCase}
                        result={caseResult}
                        isLast={index + 1 >= SKIN_CASES.length}
                        onNext={next}
                    />
                </div>
            )}
        </div>
    );
}

function CaseFeedback({
    item,
    result,
    isLast,
    onNext,
}: {
    item: SkinCase;
    result: CaseResult;
    isLast: boolean;
    onNext: () => void;
}) {
    const points = casePoints(result);
    const both = result.stageOk && result.treatmentOk;
    const half = points > 0;

    return (
        <section
            className={`skin-feedback ${both ? "ok" : "bad"}`}
            aria-live="polite"
            aria-label="本题反馈"
        >
            <div className="skin-feedback-head">
                <span className="skin-feedback-mark" aria-hidden="true">
                    {both ? "✓" : half ? "!" : "×"}
                </span>
                <div className="skin-feedback-copy">
                    <b>
                        {both
                            ? "两项都正确"
                            : half
                              ? "对了一半"
                              : "两项都需要修正"}
                    </b>
                    <span>本题 {points} / 100 分 · 分期 50 + 处理 50</span>
                </div>
            </div>

            <div className="skin-feedback-block">
                <span className="skin-feedback-kicker">分期</span>
                <div
                    className={`skin-verdict ${result.stageOk ? "ok" : "bad"}`}
                >
                    <b>{stageOption(item.stage).full}</b>
                    <span>
                        {result.stageOk
                            ? "选择正确"
                            : `你选的是 ${STAGE_LABELS[result.stage]}；正确为 ${STAGE_LABELS[item.stage]}`}
                    </span>
                </div>
                <p>{item.stageWhy}</p>
            </div>

            <div className="skin-feedback-block">
                <span className="skin-feedback-kicker">处理（TIMES）</span>
                <div
                    className={`skin-verdict ${
                        result.treatmentOk ? "ok" : "bad"
                    }`}
                >
                    <b>{TREATMENTS[item.correctTreatment].text}</b>
                    <span>
                        {result.treatmentOk
                            ? "选择正确"
                            : `你选的是：${TREATMENTS[result.treatment].text}`}
                    </span>
                </div>
                <p>{item.treatmentWhy}</p>
                {!result.treatmentOk && (
                    <p className="skin-why-wrong">
                        {item.wrongWhys[result.treatment] ??
                            TREATMENTS[result.treatment].why}
                    </p>
                )}
            </div>

            <button
                type="button"
                className="skin-btn primary lg"
                onClick={onNext}
            >
                {isLast ? "查看结算" : "下一病例"}
            </button>
        </section>
    );
}

function LayerLegend() {
    return (
        <div className="skin-legend" role="group" aria-label="皮肤分层图例">
            {[...SKIN_LAYERS].reverse().map((layer) => (
                <span className="skin-legend-item" key={layer.id}>
                    <i
                        className="skin-swatch"
                        style={{ background: layer.color }}
                        aria-hidden="true"
                    />
                    <span>
                        <b>{layer.name}</b>
                        <small>{layer.note}</small>
                    </span>
                </span>
            ))}
        </div>
    );
}

function DepthMeter({
    wound,
    probed,
}: {
    wound: WoundProfile;
    probed: boolean;
}) {
    const depthPercent = ((SKIN_TOP - wound.floorY) / SKIN_TOP) * 100;
    const segments = [...SKIN_LAYERS].reverse();

    return (
        <div className="skin-depth">
            <div className="skin-depth-head">
                <span>深度示意</span>
                <b>{probed ? wound.depthLabel : "使用探针读取"}</b>
            </div>
            <div className="skin-depth-track">
                {segments.map((layer) => (
                    <i
                        key={layer.id}
                        style={{
                            flexGrow: layer.y1 - layer.y0,
                            background: layer.color,
                        }}
                        aria-hidden="true"
                    />
                ))}
                {probed && !wound.eschar && (
                    <span
                        className="skin-depth-marker"
                        style={{
                            left: `${Math.max(
                                0,
                                Math.min(100, depthPercent),
                            )}%`,
                        }}
                        aria-hidden="true"
                    />
                )}
            </div>
            <div className="skin-depth-foot" aria-hidden="true">
                <span>表皮</span>
                <span>骨面</span>
            </div>
        </div>
    );
}

/** 没有 WebGL 时用纯 DOM 画一张剖面图，文字说明仍然完整 */
function FlatSkin({ wound }: { wound: WoundProfile }) {
    const depthPercent = ((SKIN_TOP - wound.floorY) / SKIN_TOP) * 100;
    const open = wound.surfaceHole > 0;

    return (
        <div
            className="skin-flat"
            role="img"
            aria-label={
                open ? "皮肤剖面示意图，可见创口" : "皮肤剖面示意图，表皮完整"
            }
        >
            <div className="skin-flat-layers" aria-hidden="true">
                {[...SKIN_LAYERS].reverse().map((layer) => (
                    <div
                        key={layer.id}
                        className="skin-flat-layer"
                        style={{
                            flexGrow: layer.y1 - layer.y0,
                            background: layer.color,
                        }}
                    >
                        <span>{layer.name}</span>
                    </div>
                ))}
            </div>
            {open && (
                <div
                    className="skin-flat-wound"
                    style={{
                        height: `${Math.max(0, Math.min(100, depthPercent))}%`,
                        background: BASE_TISSUE_COLORS[wound.baseLayer],
                    }}
                    aria-hidden="true"
                />
            )}
            {wound.eschar && (
                <span className="skin-flat-eschar" aria-hidden="true" />
            )}
            {wound.bruise && (
                <span
                    className={`skin-flat-bruise ${wound.bruise}`}
                    aria-hidden="true"
                />
            )}
            {wound.blister && (
                <span className="skin-flat-blister" aria-hidden="true" />
            )}
        </div>
    );
}
