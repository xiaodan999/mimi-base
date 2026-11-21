import { useCallback, useEffect, useRef, useState } from "react";

import { readAiCache } from "./cache";
import { aiErrorText, isAiCanceled } from "./client";
import {
    type AiFeatureSnapshot,
    restoreAiFeature,
    shouldAutoStart,
} from "./feature-restore";
import type { ResumePayload } from "./interrupted";
import { decideAiRestore } from "./restore";
import type { AiTaskHref, AiTaskKind } from "./task-store";
import { useAiTasks } from "./tasks";

export type AiFeatureRunContext = { signal: AbortSignal };

export type UseAiFeatureOptions<T> = {
    /** Task key; also used as the cache key and the default attendance group. */
    key: string;
    title: string;
    subtitle?: string;
    /** Attendance group; defaults to `key`. */
    group?: string;
    href?: AiTaskHref;
    kind?: AiTaskKind;
    summarize?: (value: T) => string;
    /** Treat empty containers as "nothing to restore" (defaults to non-null). */
    hasValue?: (value: T) => boolean;
    /** Value the mounted surface already holds; outranks task/cache on restore. */
    local?: T | null;
    /** Gate the restore/run/attend lifecycle. Default true. */
    enabled?: boolean;
    /** Request automatically when nothing usable was restored. Default true. */
    autoStart?: boolean;
    /** Keep a good cached value when a forced rerun fails. */
    keepCacheOnError?: boolean;
    /** Reproducible prompt recorded for resume after the page is killed. */
    resume?: ResumePayload;
    run: (context: AiFeatureRunContext) => Promise<T>;
};

export type UseAiFeatureResult<T> = AiFeatureSnapshot<T> & {
    running: boolean;
    start: (options?: { force?: boolean }) => Promise<T | null>;
    /** Cancel the task for this key through the shared task store. */
    cancel: () => void;
    /** Clear local state without touching the cache or the task. */
    reset: () => void;
};

const IDLE: AiFeatureSnapshot<never> = {
    phase: "idle",
    value: null,
    error: "",
};

/**
 * Shared orchestration for cache-backed AI surfaces that are not streaming:
 * restore the newest of local value → task result → cache, run/join the task,
 * let the task store write the cache, and attend the group while mounted.
 *
 * AiPanel keeps its own streaming loop; surfaces with editable drafts
 * (expense parsing, category fixing) keep their bespoke state machines.
 */
export function useAiFeature<T>(
    options: UseAiFeatureOptions<T>,
): UseAiFeatureResult<T> {
    const { runTask, find, getResult, attend, cancel } = useAiTasks();
    const { key, group, enabled = true } = options;
    const [snapshot, setSnapshot] = useState<AiFeatureSnapshot<T>>(IDLE);
    const optionsRef = useRef(options);
    optionsRef.current = options;
    const mountedRef = useRef(true);
    const keyRef = useRef(key);
    keyRef.current = key;
    const ticketRef = useRef(0);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const start = useCallback(
        async ({ force = false }: { force?: boolean } = {}) => {
            const opts = optionsRef.current;
            if (!opts.key) return null;

            const ticket = ++ticketRef.current;
            setSnapshot((previous) => ({
                phase: "running",
                value: force ? null : previous.value,
                error: "",
            }));

            try {
                const value = await runTask<T>({
                    key: opts.key,
                    group: opts.group ?? opts.key,
                    cacheKey: opts.key,
                    title: opts.title,
                    subtitle: opts.subtitle,
                    href: opts.href,
                    kind: opts.kind,
                    force,
                    summarize: opts.summarize,
                    resume: opts.resume,
                    run: (context) => opts.run(context),
                });
                if (
                    mountedRef.current &&
                    ticketRef.current === ticket &&
                    keyRef.current === opts.key
                ) {
                    setSnapshot({ phase: "ready", value, error: "" });
                }
                return value;
            } catch (error) {
                if (
                    !mountedRef.current ||
                    ticketRef.current !== ticket ||
                    keyRef.current !== opts.key
                ) {
                    return null;
                }
                if (isAiCanceled(error)) {
                    // 主动取消不算报错：和旧面板一样不写 error；只有恢复一个
                    // 已取消的任务时才显示「已取消」。
                    setSnapshot({ phase: "canceled", value: null, error: "" });
                    return null;
                }
                if (opts.keepCacheOnError) {
                    // A failed rerun must not hide the last good answer.
                    const decision = decideAiRestore<T>({
                        task: find(opts.key),
                        result: getResult<T>(opts.key),
                        cached: readAiCache<T>(opts.key),
                        hasValue: opts.hasValue,
                    });
                    if (decision.kind === "ready") {
                        setSnapshot({
                            phase: "ready",
                            value: decision.value,
                            error: "",
                        });
                        return decision.value;
                    }
                }
                setSnapshot({
                    phase: "error",
                    value: null,
                    error: aiErrorText(error),
                });
                return null;
            }
        },
        [find, getResult, runTask],
    );

    // biome-ignore lint/correctness/useExhaustiveDependencies: 故意只在 key / enabled 上重建，其余选项走 ref
    useEffect(() => {
        if (!enabled) {
            ticketRef.current += 1;
            setSnapshot(IDLE);
            return;
        }
        if (!key) {
            ticketRef.current += 1;
            setSnapshot(IDLE);
            return;
        }

        const opts = optionsRef.current;
        const decision = restoreAiFeature<T>({
            task: find(key),
            local: opts.local,
            result: getResult<T>(key),
            cached: readAiCache<T>(key),
            hasValue: opts.hasValue,
        });
        ticketRef.current += 1;
        setSnapshot(decision);
        if ((opts.autoStart ?? true) && shouldAutoStart(decision.phase)) {
            void start();
        }
    }, [key, enabled]);

    useEffect(() => {
        if (!enabled || !key) return;
        return attend(group ?? key);
    }, [enabled, key, group, attend]);

    return {
        ...snapshot,
        running: snapshot.phase === "running",
        start,
        cancel: () => cancel(keyRef.current),
        reset: () => {
            ticketRef.current += 1;
            setSnapshot(IDLE);
        },
    };
}
