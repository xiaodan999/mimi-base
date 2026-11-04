import type { AiTask } from "./task-store";

/**
 * How an AI surface should present the task it started before it was closed.
 *
 * Background tasks keep running after their panel closes, so every consumer
 * has to answer the same question on reopen: show an existing result, join a
 * task that is still running, surface an error, or start a new request.
 * Keeping that decision here makes the behavior (and its tests) uniform.
 */
export type AiRestoreDecision<T> =
    | { kind: "ready"; value: T; source: "local" | "result" | "cache" }
    | { kind: "running" }
    | { kind: "error"; message: string }
    | { kind: "canceled" }
    | { kind: "none" };

type RestoreTask = Pick<AiTask, "status" | "error">;

export type AiRestoreInput<T> = {
    /** The latest task recorded for this key, if any. */
    task?: RestoreTask;
    /** State the still-mounted component already holds for this key. */
    local?: T | null;
    /** In-memory result from the task store (newest copy). */
    result?: T | null;
    /** Persisted copy from `mimi:ai-cache:v1:*`. */
    cached?: T | null;
    /** Treat empty containers (e.g. `[]` / `""`) as "nothing to restore". */
    hasValue?: (value: T) => boolean;
};

/**
 * Decide what to show when an AI panel (re)opens.
 *
 * A running task always wins: joining it is cheaper and fresher than showing
 * a result from a previous batch. Pending values are preferred local → result
 * → cache, because that is newest first. Error/canceled are only surfaced when
 * there is nothing usable to show.
 */
export function decideAiRestore<T>({
    task,
    local,
    result,
    cached,
    hasValue = (value) => value != null,
}: AiRestoreInput<T>): AiRestoreDecision<T> {
    if (task?.status === "running") return { kind: "running" };

    const candidates: ["local" | "result" | "cache", T | null | undefined][] = [
        ["local", local],
        ["result", result],
        ["cache", cached],
    ];
    for (const [source, value] of candidates) {
        if (value != null && hasValue(value)) {
            return { kind: "ready", value, source };
        }
    }

    if (task?.status === "error") {
        return { kind: "error", message: task.error?.trim() || "AI 请求失败" };
    }
    if (task?.status === "canceled") return { kind: "canceled" };
    return { kind: "none" };
}
