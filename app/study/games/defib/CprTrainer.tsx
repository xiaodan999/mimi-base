import { useCallback, useEffect, useRef, useState } from "react";

import {
    CPR_BPM,
    CPR_DURATION_MS,
    gradeBeatDelta,
    rhythmBeatCount,
    rhythmBeatInterval,
    scoreRhythm,
    type BeatGrade,
    type RhythmResult,
} from "./scoring";

type Status = "ready" | "countdown" | "running" | "done";

type LiveCounts = {
    perfect: number;
    good: number;
    miss: number;
    last: BeatGrade | null;
    lastDelta: number;
};

const EMPTY_LIVE: LiveCounts = {
    perfect: 0,
    good: 0,
    miss: 0,
    last: null,
    lastDelta: 0,
};

const LAST_BEAT_INDEX = Math.max(
    0,
    rhythmBeatCount(CPR_DURATION_MS, CPR_BPM) - 1,
);

const GRADE_TEXT: Record<BeatGrade, string> = {
    perfect: "完美",
    good: "良好",
    miss: "偏了",
};

type Props = {
    onComplete: (result: RhythmResult) => void;
};

function formatDelta(delta: number): string {
    const abs = Math.abs(Math.round(delta));
    if (abs < 5) return "正中节拍";
    return delta < 0 ? `快了 ${abs} ms` : `慢了 ${abs} ms`;
}

export default function CprTrainer({ onComplete }: Props) {
    const [status, setStatus] = useState<Status>("ready");
    const [countdown, setCountdown] = useState(3);
    const [elapsed, setElapsed] = useState(0);
    const [live, setLive] = useState<LiveCounts>(EMPTY_LIVE);
    const [final, setFinal] = useState<RhythmResult | null>(null);
    const startAtRef = useRef(0);
    const tapsRef = useRef<number[]>([]);
    const finishedRef = useRef(false);
    const statusRef = useRef(status);
    statusRef.current = status;

    const finish = useCallback(() => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        setFinal(
            scoreRhythm(tapsRef.current, {
                durationMs: CPR_DURATION_MS,
                bpm: CPR_BPM,
            }),
        );
        setStatus("done");
    }, []);

    useEffect(() => {
        if (status !== "countdown") return;
        if (countdown <= 0) {
            startAtRef.current = performance.now();
            setElapsed(0);
            setStatus("running");
            return;
        }
        const timer = window.setTimeout(() => {
            setCountdown((value) => value - 1);
        }, 700);
        return () => window.clearTimeout(timer);
    }, [status, countdown]);

    useEffect(() => {
        if (status !== "running") return;
        const timer = window.setInterval(() => {
            const now = performance.now() - startAtRef.current;
            if (now >= CPR_DURATION_MS) {
                setElapsed(CPR_DURATION_MS);
                finish();
                return;
            }
            setElapsed(now);
        }, 100);
        return () => window.clearInterval(timer);
    }, [status, finish]);

    const tap = useCallback(() => {
        if (statusRef.current !== "running" || finishedRef.current) return;
        const at = performance.now() - startAtRef.current;
        if (at < 0 || at > CPR_DURATION_MS) return;
        tapsRef.current = [...tapsRef.current, at];
        const interval = rhythmBeatInterval(CPR_BPM);
        const index = Math.min(
            LAST_BEAT_INDEX,
            Math.max(0, Math.round(at / interval)),
        );
        const delta = at - index * interval;
        const grade = gradeBeatDelta(delta);
        setLive((current) => {
            const next = { ...current };
            next[grade] += 1;
            next.last = grade;
            next.lastDelta = Math.round(delta);
            return next;
        });
    }, []);

    useEffect(() => {
        if (status !== "running") return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.code !== "Space" && event.key !== " ") return;
            if (event.repeat) return;
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            const active = document.activeElement;
            if (
                active instanceof HTMLButtonElement &&
                active.dataset.defibTap !== "true"
            ) {
                return;
            }
            event.preventDefault();
            tap();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [status, tap]);

    const taps = live.perfect + live.good + live.miss;
    const accuracy =
        taps > 0 ? Math.round(((live.perfect + live.good) / taps) * 100) : null;
    const remaining = Math.max(
        0,
        Math.ceil((CPR_DURATION_MS - elapsed) / 1000),
    );

    return (
        <section className="defib-cpr" aria-labelledby="defib-cpr-title">
            <h2 className="defib-cpr-title" id="defib-cpr-title">
                CPR 节律 · 目标 110 次/分
            </h2>

            {status === "ready" && (
                <div className="defib-cpr-card">
                    <div className="defib-cpr-icon" aria-hidden="true">
                        🫀
                    </div>
                    <p>
                        持续按压 30 秒。跟着节拍器，以 110 次/分按压；
                        可点下方大按钮，也可按空格键。
                    </p>
                    <div className="defib-cpr-hints">
                        <span>完美 ±90 ms</span>
                        <span>良好 ±200 ms</span>
                        <span>漏拍记失误</span>
                    </div>
                    <button
                        className="g-btn primary lg"
                        onClick={() => {
                            setCountdown(3);
                            setStatus("countdown");
                        }}
                    >
                        开始按压
                    </button>
                </div>
            )}

            {status === "countdown" && (
                <div
                    className="defib-cpr-card defib-cpr-countdown"
                    role="status"
                    aria-live="assertive"
                >
                    <span>准备</span>
                    <b>{countdown > 0 ? countdown : "开始"}</b>
                    <small>跟着节拍，保持 110 次/分</small>
                </div>
            )}

            {status === "running" && (
                <div className="defib-cpr-live">
                    <div className="defib-cpr-head">
                        <span
                            className="defib-metronome"
                            style={{
                                animationDuration: `${rhythmBeatInterval(
                                    CPR_BPM,
                                )}ms`,
                            }}
                            aria-hidden="true"
                        />
                        <div className="defib-cpr-headcopy">
                            <b>110 次/分</b>
                            <span>剩余 {remaining} 秒</span>
                        </div>
                        <span className="defib-cpr-accuracy">
                            {accuracy === null ? "—" : `${accuracy}%`}
                        </span>
                    </div>

                    <div
                        className="defib-cpr-progress"
                        role="progressbar"
                        aria-label="CPR 进度"
                        aria-valuemin={0}
                        aria-valuemax={30}
                        aria-valuenow={Math.min(30, Math.round(elapsed / 1000))}
                    >
                        <i
                            style={{
                                width: `${Math.min(
                                    100,
                                    (elapsed / CPR_DURATION_MS) * 100,
                                )}%`,
                            }}
                        />
                    </div>

                    <button
                        type="button"
                        className={`defib-tap ${
                            live.last ? `defib-tap-${live.last}` : ""
                        }`}
                        data-defib-tap="true"
                        aria-keyshortcuts="Space"
                        onClick={tap}
                        aria-label="按压一次"
                    >
                        <span className="defib-tap-ring" aria-hidden="true" />
                        <span className="defib-tap-label">按压</span>
                        <span className="defib-tap-key">或按空格</span>
                    </button>

                    <div className={`defib-live-grade ${live.last ?? "idle"}`}>
                        {live.last ? (
                            <>
                                <b>{GRADE_TEXT[live.last]}</b>
                                <span>{formatDelta(live.lastDelta)}</span>
                            </>
                        ) : (
                            <span>跟着节拍开始按压</span>
                        )}
                    </div>

                    <div className="defib-cpr-stats">
                        <span className="defib-stat perfect">
                            完美 <b>{live.perfect}</b>
                        </span>
                        <span className="defib-stat good">
                            良好 <b>{live.good}</b>
                        </span>
                        <span className="defib-stat miss">
                            失误 <b>{live.miss}</b>
                        </span>
                        <span className="defib-stat accuracy">
                            准确率{" "}
                            <b>{accuracy === null ? "—" : `${accuracy}%`}</b>
                        </span>
                    </div>

                    <button
                        type="button"
                        className="g-btn ghost defib-cpr-stop"
                        onClick={finish}
                    >
                        提前结束
                    </button>
                </div>
            )}

            {status === "done" && final && (
                <div className="defib-cpr-card defib-cpr-summary">
                    <div className="defib-cpr-done-kicker">30 秒按压结束</div>
                    <div className="defib-cpr-score">
                        {Math.round(final.accuracy * 100)}
                        <small>%</small>
                    </div>
                    <div className="defib-cpr-sub">
                        命中 {final.hits}/{final.beats} 拍
                    </div>
                    <div className="defib-cpr-stats">
                        <span className="defib-stat perfect">
                            完美 <b>{final.perfect}</b>
                        </span>
                        <span className="defib-stat good">
                            良好 <b>{final.good}</b>
                        </span>
                        <span className="defib-stat miss">
                            失误 <b>{final.miss}</b>
                        </span>
                        <span className="defib-stat">
                            多余 <b>{final.extra}</b>
                        </span>
                    </div>
                    <p className="defib-cpr-note">
                        {final.accuracy >= 0.85
                            ? "节奏很稳，按压质量达标。"
                            : "下一次跟紧节拍器，尽量减少漏拍。"}
                        漏拍的节拍记为失误。
                    </p>
                    <button
                        className="g-btn primary lg"
                        onClick={() => onComplete(final)}
                    >
                        进入除颤
                    </button>
                </div>
            )}
        </section>
    );
}
