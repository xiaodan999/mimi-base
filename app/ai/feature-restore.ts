import {
    type AiRestoreDecision,
    type AiRestoreInput,
    decideAiRestore,
} from "./restore";

/**
 * Normalized state every non-streaming AI surface can render from. It is a
 * pure translation of `decideAiRestore`, kept separate from React so the
 * presentation rules stay unit-testable.
 */
export type AiFeaturePhase =
    "idle" | "running" | "ready" | "error" | "canceled";

export type AiFeatureSnapshot<T> = {
    phase: AiFeaturePhase;
    value: T | null;
    /** User-facing message; "已取消" for canceled tasks. */
    error: string;
};

export function toAiFeatureSnapshot<T>(
    decision: AiRestoreDecision<T>,
): AiFeatureSnapshot<T> {
    switch (decision.kind) {
        case "ready":
            return { phase: "ready", value: decision.value, error: "" };
        case "running":
            return { phase: "running", value: null, error: "" };
        case "error":
            return { phase: "error", value: null, error: decision.message };
        case "canceled":
            return { phase: "canceled", value: null, error: "已取消" };
        case "none":
            return { phase: "idle", value: null, error: "" };
    }
}

/** Same decision as every AI panel, normalized for feature surfaces. */
export function restoreAiFeature<T>(
    input: AiRestoreInput<T>,
): AiFeatureSnapshot<T> {
    return toAiFeatureSnapshot(decideAiRestore(input));
}

/**
 * After a restore, `running` means joining the task already in flight and
 * `idle` means nothing was cached — both should call the model right away.
 * `error` / `canceled` have a task row to show, so they must not retry on
 * their own.
 */
export function shouldAutoStart(phase: AiFeaturePhase): boolean {
    return phase === "running" || phase === "idle";
}
