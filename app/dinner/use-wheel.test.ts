import { describe, expect, test } from "bun:test";

import type { DinnerOption } from "./options";
import {
    INITIAL_WHEEL_STATE,
    spinDuration,
    WHEEL_REDUCED_MS,
    WHEEL_SPIN_MS,
    wheelReducer,
    type WheelState,
} from "./use-wheel";

const hotpot: DinnerOption = { id: "a", name: "火锅" };
const noodles: DinnerOption = { id: "b", name: "面" };

function resultState(): WheelState {
    return { phase: "result", rotation: 720, picked: hotpot };
}

describe("wheelReducer", () => {
    test("starts idle", () => {
        expect(INITIAL_WHEEL_STATE).toEqual({
            phase: "idle",
            rotation: 0,
            picked: null,
        });
    });

    test("spin picks an option and starts from the previous rotation", () => {
        expect(
            wheelReducer(INITIAL_WHEEL_STATE, {
                type: "spin",
                picked: hotpot,
                rotation: 360,
            }),
        ).toEqual({ phase: "spinning", rotation: 360, picked: hotpot });
    });

    test("spin is ignored while already spinning", () => {
        const spinning: WheelState = {
            phase: "spinning",
            rotation: 360,
            picked: hotpot,
        };
        expect(
            wheelReducer(spinning, {
                type: "spin",
                picked: noodles,
                rotation: 720,
            }),
        ).toBe(spinning);
    });

    test("finish only leaves spinning", () => {
        const spinning: WheelState = {
            phase: "spinning",
            rotation: 360,
            picked: hotpot,
        };
        expect(wheelReducer(spinning, { type: "finish" }).phase).toBe("result");
        expect(
            wheelReducer(INITIAL_WHEEL_STATE, { type: "finish" }).phase,
        ).toBe("idle");
    });

    test("save needs a picked result", () => {
        expect(wheelReducer(resultState(), { type: "save" }).phase).toBe(
            "saving",
        );
        expect(
            wheelReducer({ ...resultState(), picked: null }, { type: "save" })
                .phase,
        ).toBe("result");
    });

    test("saved only follows saving", () => {
        const saving: WheelState = {
            phase: "saving",
            rotation: 720,
            picked: hotpot,
        };
        expect(wheelReducer(saving, { type: "saved" }).phase).toBe("saved");
        expect(wheelReducer(resultState(), { type: "saved" }).phase).toBe(
            "result",
        );
    });

    test("a failed save returns to the result", () => {
        const saving: WheelState = {
            phase: "saving",
            rotation: 720,
            picked: hotpot,
        };
        expect(wheelReducer(saving, { type: "save-failed" }).phase).toBe(
            "result",
        );
    });

    test("options-changed clears a deleted winner", () => {
        expect(
            wheelReducer(resultState(), {
                type: "options-changed",
                ids: ["b"],
            }),
        ).toEqual({ phase: "idle", rotation: 720, picked: null });
    });

    test("options-changed keeps a winner that still exists", () => {
        const state = resultState();
        expect(
            wheelReducer(state, {
                type: "options-changed",
                ids: ["a", "b"],
            }),
        ).toBe(state);
    });
});

describe("spinDuration", () => {
    test("uses the rotor duration unless reduced motion is on", () => {
        expect(spinDuration(false)).toBe(WHEEL_SPIN_MS);
        expect(spinDuration(true)).toBe(WHEEL_REDUCED_MS);
    });
});
