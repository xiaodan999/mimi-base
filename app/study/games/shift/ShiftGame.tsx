import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
    SHIFT_EVENTS,
    SHIFT_RESOLVE_SAFETY,
    SHIFT_RETRY_SAFETY,
    SHIFT_TOTAL_SECONDS,
    SHIFT_WRONG_SAFETY,
    shiftHazard,
    type ShiftEventDef,
} from "./events";
import {
    GAME_ICON,
    GAME_ID,
    GAME_MINUTES,
    GAME_SUBTITLE,
    GAME_TITLE,
} from "./meta";
import { shiftScore } from "./scoring";
import { useStudy } from "../../components/StudyContext";
import { fmtTime, shuffle } from "../../engine";
import { toast } from "../../toast";
import ResultPanel from "../components/ResultPanel";
import { recordGame, type GameOutcome } from "../meta";
import WardScene from "../ward/WardScene";
import "./shift.css";

export * from "./meta";

type Phase = "intro" | "playing" | "result";

type RuntimeStatus = "upcoming" | "active" | "resolved" | "missed";

type RuntimeEvent = {
    def: ShiftEventDef;
    /** 每局重新洗牌，避免正确答案总在 A */
    options: ShiftEventDef["options"];
    status: RuntimeStatus;
    remaining: number;
    wrong: number;
};

type Snapshot = {
    elapsed: number;
    safety: number;
    combo: number;
    bestCombo: number;
    events: RuntimeEvent[];
};

type PanelFeedback = {
    kind: "correct" | "wrong";
    text: string;
    optionIndex: number;
    fatal: boolean;
};

type EndReason = "done" | "time" | "fail";

function makeRuntime(): RuntimeEvent[] {
    return SHIFT_EVENTS.map((def) => ({
        def,
        options: shuffle(def.options),
        status: "upcoming",
        remaining: def.deadline,
        wrong: 0,
    }));
}

function snapshotOf(
    events: RuntimeEvent[],
    elapsed: number,
    safety: number,
    combo: number,
    bestCombo: number,
): Snapshot {
    return {
        elapsed,
        safety,
        combo,
        bestCombo,
        events: events.map((event) => ({ ...event })),
    };
}

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

export default function ShiftGame() {
    const { subject, progress, update } = useStudy();
    const navigate = useNavigate();
    const [phase, setPhase] = useState<Phase>("intro");
    const [snapshot, setSnapshot] = useState<Snapshot>(() =>
        snapshotOf(makeRuntime(), 0, 100, 0, 0),
    );
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [panel, setPanel] = useState<PanelFeedback | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [outcome, setOutcome] = useState<GameOutcome | null>(null);
    const [lastResult, setLastResult] = useState<{
        score: number;
        stars: 0 | 1 | 2 | 3;
    }>({ score: 0, stars: 0 });
    const [endReason, setEndReason] = useState<EndReason | null>(null);
    const [webgl] = useState(() => supportsWebGL());
    const [showScene, setShowScene] = useState(true);

    const eventsRef = useRef<RuntimeEvent[]>([]);
    const elapsedRef = useRef(0);
    const safetyRef = useRef(100);
    const comboRef = useRef(0);
    const bestComboRef = useRef(0);
    const selectedRef = useRef<string | null>(null);
    const lastTickRef = useRef(0);
    const startedAtRef = useRef(0);
    const fatalRef = useRef(false);
    const recordedRef = useRef(false);
    const phaseRef = useRef<Phase>("intro");
    const noticeTimerRef = useRef<number | null>(null);
    const panelRef = useRef<HTMLElement | null>(null);
    const queueRef = useRef<HTMLElement | null>(null);
    const tickRef = useRef<() => void>(() => undefined);
    const closePanelRef = useRef<() => void>(() => undefined);

    function flush() {
        setSnapshot(
            snapshotOf(
                eventsRef.current,
                elapsedRef.current,
                safetyRef.current,
                comboRef.current,
                bestComboRef.current,
            ),
        );
    }

    function showNotice(text: string) {
        setNotice(text);
        if (noticeTimerRef.current !== null) {
            window.clearTimeout(noticeTimerRef.current);
        }
        noticeTimerRef.current = window.setTimeout(() => {
            noticeTimerRef.current = null;
            setNotice(null);
        }, 1800);
    }

    function exit() {
        void navigate({
            to: "/study/$subjectId/$section",
            params: { subjectId: subject.id, section: "games" },
            search: {},
        });
    }

    function allResolved(): boolean {
        return eventsRef.current.every((event) => event.status === "resolved");
    }

    function start() {
        eventsRef.current = makeRuntime();
        elapsedRef.current = 0;
        safetyRef.current = 100;
        comboRef.current = 0;
        bestComboRef.current = 0;
        selectedRef.current = null;
        fatalRef.current = false;
        recordedRef.current = false;
        lastTickRef.current = Date.now();
        startedAtRef.current = Date.now();
        phaseRef.current = "playing";

        if (noticeTimerRef.current !== null) {
            window.clearTimeout(noticeTimerRef.current);
            noticeTimerRef.current = null;
        }
        setNotice(null);
        setSelectedId(null);
        setPanel(null);
        setOutcome(null);
        setLastResult({ score: 0, stars: 0 });
        setEndReason(null);
        setSnapshot(snapshotOf(eventsRef.current, 0, 100, 0, 0));
        setPhase("playing");
    }

    function finish(reason: EndReason) {
        if (recordedRef.current) return;
        recordedRef.current = true;

        const events = eventsRef.current;
        const resolved = events.filter(
            (event) => event.status === "resolved",
        ).length;
        const missed = events.filter(
            (event) => event.status === "missed",
        ).length;
        const wrong = events.reduce((sum, event) => sum + event.wrong, 0);
        const safety = safetyRef.current;
        const failed = reason === "fail" || safety <= 0;
        const scored = shiftScore({
            safety,
            resolved,
            total: SHIFT_EVENTS.length,
            wrong,
            missed,
            timeLeft: Math.max(0, SHIFT_TOTAL_SECONDS - elapsedRef.current),
            failed,
        });
        const next = recordGame(progress, GAME_ID, {
            ...scored,
            correct: resolved,
            total: SHIFT_EVENTS.length,
            durationMs: Math.max(1, Date.now() - startedAtRef.current),
            combo: bestComboRef.current,
            nearMiss: wrong,
            completed: !failed,
        });

        flush();
        update(() => next.progress);
        setOutcome(next);
        setLastResult(scored);
        setEndReason(failed ? "fail" : reason);
        setPhase("result");
        phaseRef.current = "result";
        selectedRef.current = null;
        setSelectedId(null);
        setPanel(null);
        if (next.unlocked.length) {
            toast(
                `解锁徽章：${next.unlocked
                    .map((badge) => badge.name)
                    .join("、")}`,
            );
        }
    }

    function tick() {
        if (phaseRef.current !== "playing" || recordedRef.current) return;
        if (fatalRef.current || allResolved()) return;

        const now = Date.now();
        const dt = Math.min(
            1.5,
            Math.max(0, (now - lastTickRef.current) / 1000),
        );
        lastTickRef.current = now;
        elapsedRef.current = Math.min(
            SHIFT_TOTAL_SECONDS,
            elapsedRef.current + dt,
        );

        for (const event of eventsRef.current) {
            if (
                event.status === "upcoming" &&
                event.def.spawnAt <= elapsedRef.current
            ) {
                event.status = "active";
                event.remaining = event.def.deadline;
            }
        }

        const missedNow: string[] = [];

        for (const event of eventsRef.current) {
            if (event.status !== "active") continue;
            // 打开事件面板时，只暂停这一起事件的倒计时
            if (event.def.id === selectedRef.current) continue;
            event.remaining = Math.max(0, event.remaining - dt);
            if (event.remaining > 0) continue;
            event.status = "missed";
            missedNow.push(event.def.title);
            safetyRef.current = Math.max(
                0,
                safetyRef.current - event.def.penalty,
            );
            comboRef.current = 0;
        }

        flush();

        if (missedNow.length > 0) {
            showNotice(`${missedNow.join("、")} 超时未处理，患者安全下降`);
        }
        if (safetyRef.current <= 0) {
            finish("fail");
            return;
        }
        if (elapsedRef.current >= SHIFT_TOTAL_SECONDS) {
            finish("time");
        }
    }

    tickRef.current = tick;

    function openEvent(id: string) {
        if (phaseRef.current !== "playing" || selectedRef.current) return;
        const event = eventsRef.current.find((item) => item.def.id === id);
        if (!event || event.status !== "active") return;
        selectedRef.current = id;
        setSelectedId(id);
        setPanel(null);
    }

    function selectObject(objectId: string) {
        if (phaseRef.current !== "playing" || selectedRef.current) return;
        const event = eventsRef.current.find(
            (item) => item.def.object === objectId,
        );
        if (!event) {
            showNotice("这里暂时没有发现异常。");
            return;
        }
        if (event.status === "resolved") {
            showNotice(`已经处理：${event.def.fix}`);
            return;
        }
        if (event.status === "missed") {
            showNotice("这起事件已经超时，写进交班记录了。");
            return;
        }
        if (event.status === "upcoming") {
            showNotice("这里暂时正常，继续观察。");
            return;
        }
        openEvent(event.def.id);
    }

    function choose(optionIndex: number) {
        if (phaseRef.current !== "playing") return;
        const id = selectedRef.current;
        if (!id) return;
        const event = eventsRef.current.find((item) => item.def.id === id);
        if (!event || event.status !== "active") return;
        const option = event.options[optionIndex];
        if (!option) return;

        if (option.ok) {
            event.status = "resolved";
            event.remaining = 0;
            safetyRef.current = Math.min(
                100,
                safetyRef.current +
                    (event.wrong === 0
                        ? SHIFT_RESOLVE_SAFETY
                        : SHIFT_RETRY_SAFETY),
            );
            comboRef.current += 1;
            bestComboRef.current = Math.max(
                bestComboRef.current,
                comboRef.current,
            );
            setPanel({
                kind: "correct",
                text: option.why,
                optionIndex,
                fatal: false,
            });
            flush();
            return;
        }

        event.wrong += 1;
        safetyRef.current = Math.max(0, safetyRef.current - SHIFT_WRONG_SAFETY);
        comboRef.current = 0;
        const fatal = safetyRef.current <= 0;
        fatalRef.current = fatal;
        setPanel({
            kind: "wrong",
            text: option.why,
            optionIndex,
            fatal,
        });
        flush();
    }

    function leavePanel() {
        if (fatalRef.current) {
            finish("fail");
            return;
        }
        selectedRef.current = null;
        setSelectedId(null);
        setPanel(null);
        flush();
        queueRef.current?.focus();
    }

    function closePanel() {
        if (phaseRef.current !== "playing") return;
        if (panel?.kind === "correct") {
            if (allResolved()) {
                finish("done");
                return;
            }
            leavePanel();
            return;
        }
        leavePanel();
    }

    function retry() {
        if (panel?.fatal) return;
        setPanel(null);
    }

    closePanelRef.current = closePanel;

    useEffect(() => {
        if (phase !== "playing") return;
        const timer = window.setInterval(() => tickRef.current(), 1000);
        return () => window.clearInterval(timer);
    }, [phase]);

    useEffect(() => {
        return () => {
            if (noticeTimerRef.current !== null) {
                window.clearTimeout(noticeTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (selectedId) panelRef.current?.focus();
    }, [selectedId, panel]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && selectedRef.current) {
                closePanelRef.current();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    const activeEvents = snapshot.events
        .filter((event) => event.status === "active")
        .sort((a, b) => a.remaining - b.remaining);
    const activeCount = activeEvents.length;
    const resolvedCount = snapshot.events.filter(
        (event) => event.status === "resolved",
    ).length;
    const missedCount = snapshot.events.filter(
        (event) => event.status === "missed",
    ).length;
    const upcomingCount = snapshot.events.filter(
        (event) => event.status === "upcoming",
    ).length;
    const timeLeft = Math.max(
        0,
        Math.ceil(SHIFT_TOTAL_SECONDS - snapshot.elapsed),
    );
    const safetyTone =
        snapshot.safety >= 60 ? "ok" : snapshot.safety >= 30 ? "warn" : "bad";
    const selectedEvent =
        snapshot.events.find((event) => event.def.id === selectedId) ?? null;

    // 已处理的事件也传给场景：WardScene 只有在 active && fixed 时才画绿勾，
    // 所以只传 active 事件的话，处理完的对象不会出现完成标记。
    const sceneHazards = snapshot.events
        .filter(
            (event) => event.status === "active" || event.status === "resolved",
        )
        .map((event) => shiftHazard(event.def, event.options));
    const fixedObjects = new Set(
        snapshot.events
            .filter((event) => event.status === "resolved")
            .map((event) => event.def.object),
    );

    if (phase === "result" && outcome) {
        const details = snapshot.events.map((event) => {
            const ok = event.status === "resolved";
            let note: string;
            if (ok) {
                note = event.wrong
                    ? `${event.def.fix}（先答错 ${event.wrong} 次）`
                    : event.def.fix;
            } else if (event.status === "missed") {
                note = `超时未处理，患者安全 -${event.def.penalty}。正确做法：${event.def.fix}`;
            } else {
                note = `未处理。正确做法：${event.def.fix}`;
            }
            return { title: event.def.title, ok, note };
        });
        const subtitle =
            endReason === "fail"
                ? "患者安全归零，夜班提前结束"
                : endReason === "done"
                  ? "八个事件全部处理，顺利交班"
                  : "值班结束，未处理的事件已写进交班记录";

        return (
            <div className="shift-result">
                <ResultPanel
                    title="20:00 夜班 · 综合病例"
                    subtitle={subtitle}
                    score={lastResult.score}
                    stars={lastResult.stars}
                    xpGained={outcome.xpGained}
                    isBest={outcome.isBest}
                    unlocked={outcome.unlocked}
                    unit="例"
                    correct={resolvedCount}
                    total={SHIFT_EVENTS.length}
                    gameId={GAME_ID}
                    details={details}
                    onRetry={start}
                    onExit={exit}
                />
            </div>
        );
    }

    if (phase === "intro") {
        return (
            <div className="shift-intro">
                <div className="shift-intro-bg" aria-hidden="true">
                    {webgl && (
                        <WardScene
                            hazards={[]}
                            fixed={new Set()}
                            selected={null}
                            onSelect={() => undefined}
                        />
                    )}
                </div>
                <div className="shift-intro-card">
                    <div className="gi-kicker">综合病例 · BOSS 战</div>
                    <div className="shift-intro-icon" aria-hidden="true">
                        {GAME_ICON}
                    </div>
                    <h1>{GAME_TITLE}</h1>
                    <p>
                        20:00 接班，病房不会按课本顺序出事。输血反应、
                        危急值、跌倒和火灾可能同时找上门，你只有一双手。
                    </p>
                    <ul>
                        <li>6 分钟值班，8 个突发事件，每起都有处理时限</li>
                        <li>点击病房里的物品，或从「待处理事件」列表进入</li>
                        <li>事件面板打开时，该事件倒计时暂停，可以慢慢读</li>
                        <li>答错会扣患者安全分并清空连击，超时同样扣分</li>
                        <li>患者安全归零，夜班提前结束</li>
                    </ul>
                    <button
                        className="g-btn primary lg shift-start"
                        onClick={start}
                    >
                        接班
                    </button>
                    <p className="gi-note">
                        {GAME_MINUTES} 分钟量级 · 其中值班 6 分钟 ·
                        依据《质控内容》综合病例
                        {!webgl && " · 当前设备不支持 3D，已使用事件列表模式"}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="game-shell shift-game">
            <div className="game-topbar">
                <button className="g-back" onClick={exit} aria-label="返回病区">
                    ←
                </button>
                <div className="game-topbar-copy">
                    <b>{GAME_TITLE}</b>
                    <span>
                        {GAME_SUBTITLE} · 已处理 {resolvedCount}/
                        {SHIFT_EVENTS.length}
                    </span>
                </div>
            </div>

            <div className="shift-hud">
                <div
                    className={`shift-clock ${timeLeft <= 30 ? "urgent" : ""}`}
                >
                    <b>{fmtTime(timeLeft)}</b>
                    <span>剩余值班</span>
                </div>
                <div className={`shift-safety ${safetyTone}`}>
                    <div className="shift-safety-head">
                        <span>患者安全</span>
                        <b className={safetyTone}>{snapshot.safety}</b>
                    </div>
                    <span className="shift-safety-bar" aria-hidden="true">
                        <i
                            className={safetyTone}
                            style={{ width: `${snapshot.safety}%` }}
                        />
                    </span>
                </div>
                <div className="shift-chips">
                    <span className="shift-chip active">
                        待处理 <b>{activeCount}</b>
                    </span>
                    <span className="shift-chip ok">
                        已处理 <b>{resolvedCount}</b>
                    </span>
                    <span className="shift-chip combo">
                        连击 <b>{snapshot.combo}</b>
                    </span>
                    <span className="shift-chip missed">
                        漏处理 <b>{missedCount}</b>
                    </span>
                </div>
                <p className="shift-sr" role="status" aria-live="polite">
                    {activeCount > 0
                        ? `当前有 ${activeCount} 个待处理事件`
                        : "当前没有待处理事件"}
                </p>
            </div>

            <div className="shift-stage">
                {webgl ? (
                    <div className="shift-view">
                        {showScene ? (
                            <WardScene
                                hazards={sceneHazards}
                                fixed={fixedObjects}
                                selected={null}
                                onSelect={selectObject}
                            />
                        ) : (
                            <div className="shift-scene-off">
                                3D 病房已收起，继续用下方事件列表处理。
                            </div>
                        )}
                        <button
                            className="shift-view-toggle"
                            onClick={() => setShowScene((value) => !value)}
                            aria-pressed={!showScene}
                        >
                            {showScene ? "收起 3D" : "展开 3D"}
                        </button>
                        {showScene && (
                            <div className="shift-scene-hint">
                                点击场景里异常的物品
                            </div>
                        )}
                        {notice && (
                            <div className="shift-notice" role="status">
                                {notice}
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="shift-no3d">
                            当前设备不支持 WebGL，3D 病房已关闭；
                            下方的「待处理事件」列表同样可以完成整班。
                        </div>
                        {notice && (
                            <div
                                className="shift-notice shift-notice-static"
                                role="status"
                            >
                                {notice}
                            </div>
                        )}
                    </>
                )}

                <div className="shift-side">
                    <section
                        ref={queueRef}
                        tabIndex={-1}
                        className="shift-queue"
                        aria-label="待处理事件"
                    >
                        <div className="shift-queue-head">
                            <b>待处理事件</b>
                            <span>
                                {activeCount > 0
                                    ? `${activeCount} 个进行中`
                                    : "暂无新事件"}
                            </span>
                        </div>
                        {activeEvents.length > 0 ? (
                            <div className="shift-queue-list">
                                {activeEvents.map((event) => {
                                    const seconds = Math.ceil(event.remaining);
                                    const ratio = Math.max(
                                        0,
                                        Math.min(
                                            1,
                                            event.remaining /
                                                event.def.deadline,
                                        ),
                                    );
                                    return (
                                        <button
                                            key={event.def.id}
                                            className={`shift-event ${
                                                seconds <= 8 ? "urgent" : ""
                                            } ${
                                                selectedId === event.def.id
                                                    ? "open"
                                                    : ""
                                            }`}
                                            onClick={() =>
                                                openEvent(event.def.id)
                                            }
                                            disabled={Boolean(selectedId)}
                                            aria-label={`${event.def.title}，剩余 ${seconds} 秒`}
                                        >
                                            <span
                                                className="shift-event-icon"
                                                aria-hidden="true"
                                            >
                                                {event.def.icon}
                                            </span>
                                            <span className="shift-event-copy">
                                                <b>{event.def.title}</b>
                                                <span>{event.def.scene}</span>
                                                <span
                                                    className="shift-event-bar"
                                                    aria-hidden="true"
                                                >
                                                    <i
                                                        style={{
                                                            width: `${
                                                                ratio * 100
                                                            }%`,
                                                        }}
                                                    />
                                                </span>
                                            </span>
                                            <span className="shift-event-time">
                                                {seconds}s
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="shift-queue-empty">
                                {allResolved()
                                    ? "所有事件均已处理，等待交班。"
                                    : "暂时没有新事件，保持巡视。"}
                            </p>
                        )}
                        <p className="shift-queue-foot">
                            {upcomingCount > 0
                                ? `还有 ${upcomingCount} 个事件可能随时发生。`
                                : missedCount > 0
                                  ? `已有 ${missedCount} 个事件超时，记得在结算里复盘。`
                                  : "本班事件已全部出现。"}
                        </p>
                    </section>

                    {selectedEvent && (
                        <section
                            ref={panelRef}
                            tabIndex={-1}
                            className={`shift-panel ${
                                panel?.kind === "correct"
                                    ? "ok"
                                    : panel?.kind === "wrong"
                                      ? "bad"
                                      : ""
                            }`}
                            aria-label={`处理事件：${selectedEvent.def.title}`}
                        >
                            <div className="shift-panel-head">
                                <span className="shift-panel-kicker">
                                    {panel
                                        ? panel.kind === "correct"
                                            ? "处理正确"
                                            : "处理有误"
                                        : "突发事件"}
                                </span>
                                <b>{selectedEvent.def.title}</b>
                                <span className="shift-paused">
                                    {panel?.kind === "correct"
                                        ? "已处理"
                                        : `倒计时暂停 · ${Math.ceil(
                                              selectedEvent.remaining,
                                          )}s`}
                                </span>
                            </div>
                            <p className="shift-panel-scene">
                                {selectedEvent.def.scene}
                            </p>
                            <p
                                className="shift-sr"
                                role="status"
                                aria-live="polite"
                            >
                                {panel
                                    ? `${
                                          panel.kind === "correct"
                                              ? "处理正确"
                                              : "处理有误"
                                      }。${panel.text}`
                                    : ""}
                            </p>

                            {panel ? (
                                <>
                                    <div className="shift-picked">
                                        你的选择：
                                        <b>
                                            {selectedEvent.options[
                                                panel.optionIndex
                                            ]?.text ?? ""}
                                        </b>
                                    </div>
                                    <div className="shift-why">
                                        {panel.text}
                                    </div>
                                    {panel.kind === "correct" && (
                                        <div className="shift-fix">
                                            处理：{selectedEvent.def.fix}
                                        </div>
                                    )}
                                    <div className="shift-source">
                                        依据：{selectedEvent.def.source}
                                    </div>
                                    <div className="shift-panel-actions">
                                        {panel.kind === "correct" ? (
                                            <button
                                                className="g-btn primary"
                                                onClick={closePanel}
                                            >
                                                {allResolved()
                                                    ? "查看结算"
                                                    : "继续值班"}
                                            </button>
                                        ) : panel.fatal ? (
                                            <button
                                                className="g-btn primary"
                                                onClick={() => finish("fail")}
                                            >
                                                查看结算
                                            </button>
                                        ) : (
                                            <>
                                                <button
                                                    className="g-btn primary"
                                                    onClick={retry}
                                                >
                                                    再试一次
                                                </button>
                                                <button
                                                    className="g-btn ghost"
                                                    onClick={leavePanel}
                                                >
                                                    稍后处理
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="shift-options">
                                        {selectedEvent.options.map(
                                            (option, index) => (
                                                <button
                                                    key={option.text}
                                                    className="shift-option"
                                                    onClick={() =>
                                                        choose(index)
                                                    }
                                                >
                                                    <span
                                                        className="shift-option-k"
                                                        aria-hidden="true"
                                                    >
                                                        {String.fromCharCode(
                                                            65 + index,
                                                        )}
                                                    </span>
                                                    <span>{option.text}</span>
                                                </button>
                                            ),
                                        )}
                                    </div>
                                    <div className="shift-panel-actions">
                                        <button
                                            className="g-btn ghost"
                                            onClick={leavePanel}
                                        >
                                            稍后处理
                                        </button>
                                    </div>
                                </>
                            )}
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}
