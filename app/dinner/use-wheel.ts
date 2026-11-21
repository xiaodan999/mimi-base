import { useCallback, useEffect, useReducer, useRef } from "react";

import { type DinnerOption, spinPlan, spinTurns } from "./options";

/** Must match the rotor transition in globals.css (`dinner-wheel-rotor`). */
export const WHEEL_SPIN_MS = 4200;
/** Short delay during reduced motion; the result still arrives. */
export const WHEEL_REDUCED_MS = 40;

export type WheelPhase = "idle" | "spinning" | "result" | "saving" | "saved";

export type WheelState = {
    phase: WheelPhase;
    rotation: number;
    picked: DinnerOption | null;
};

export const INITIAL_WHEEL_STATE: WheelState = {
    phase: "idle",
    rotation: 0,
    picked: null,
};

export type WheelEvent =
    | { type: "spin"; picked: DinnerOption; rotation: number }
    | { type: "finish" }
    | { type: "save" }
    | { type: "saved" }
    | { type: "save-failed" }
    | { type: "options-changed"; ids: readonly string[] };

/**
 * Pure wheel state machine: idle → spinning → result → saving → saved.
 * Spinning again from result/saved is allowed; saving is only left by a
 * successful or failed write.
 */
export function wheelReducer(state: WheelState, event: WheelEvent): WheelState {
    switch (event.type) {
        case "spin":
            if (state.phase === "spinning") return state;
            return {
                phase: "spinning",
                rotation: event.rotation,
                picked: event.picked,
            };
        case "finish":
            return state.phase === "spinning"
                ? { ...state, phase: "result" }
                : state;
        case "save":
            return state.phase === "result" && state.picked
                ? { ...state, phase: "saving" }
                : state;
        case "saved":
            return state.phase === "saving"
                ? { ...state, phase: "saved" }
                : state;
        case "save-failed":
            return state.phase === "saving"
                ? { ...state, phase: "result" }
                : state;
        case "options-changed":
            if (state.picked && !event.ids.includes(state.picked.id)) {
                return { ...state, phase: "idle", picked: null };
            }
            return state;
    }
}

/** How long the rotor runs before the result panel takes over. */
export function spinDuration(reducedMotion: boolean): number {
    return reducedMotion ? WHEEL_REDUCED_MS : WHEEL_SPIN_MS;
}

/**
 * Owns the wheel's timing and exposes the reducer state. The random plan is
 * computed here (same `spinPlan` used before) so the pure reducer stays
 * deterministic in tests.
 */
export function useWheel({
    options,
    loading,
    reducedMotion,
}: {
    options: readonly DinnerOption[];
    loading: boolean;
    reducedMotion: boolean;
}) {
    const [state, dispatch] = useReducer(wheelReducer, INITIAL_WHEEL_STATE);
    const finishTimer = useRef<number | null>(null);

    const clearFinishTimer = useCallback(() => {
        if (finishTimer.current === null) return;
        window.clearTimeout(finishTimer.current);
        finishTimer.current = null;
    }, []);

    useEffect(() => clearFinishTimer, [clearFinishTimer]);

    // A deleted option must not stay on screen as the winner.
    useEffect(() => {
        if (loading) return;
        dispatch({
            type: "options-changed",
            ids: options.map((option) => option.id),
        });
    }, [options, loading]);

    const finish = useCallback(() => {
        clearFinishTimer();
        dispatch({ type: "finish" });
    }, [clearFinishTimer]);

    const spin = useCallback(() => {
        if (state.phase === "spinning" || options.length === 0) return;
        const plan = spinPlan(
            options.length,
            state.rotation,
            Math.random,
            spinTurns(),
        );
        if (plan.index < 0) return;
        dispatch({
            type: "spin",
            picked: options[plan.index],
            rotation: plan.rotation,
        });
        clearFinishTimer();
        finishTimer.current = window.setTimeout(
            () => dispatch({ type: "finish" }),
            spinDuration(reducedMotion),
        );
    }, [clearFinishTimer, options, reducedMotion, state.phase, state.rotation]);

    const beginSave = useCallback(() => dispatch({ type: "save" }), []);
    const markSaved = useCallback(() => dispatch({ type: "saved" }), []);
    const markSaveFailed = useCallback(
        () => dispatch({ type: "save-failed" }),
        [],
    );

    return {
        ...state,
        spin,
        finish,
        beginSave,
        markSaved,
        markSaveFailed,
    };
}
