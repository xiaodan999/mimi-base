import { aiErrorText, isAiCanceled } from "./client";

export type AiTaskStatus = "running" | "done" | "error" | "canceled";

export type AiTaskKind = "stream" | "text" | "json";

/** 任务完成后可以回去查看结果的页面 */
export type AiTaskHref =
    "/home" | "/posts" | "/jizhang" | "/profile" | "/report" | "/study";

/**
 * 一个 AI 任务的公开状态。`text` 是流式输出（或文本结果），
 * `summary` 给通知和任务中心用，JSON 结果不直接塞进列表。
 */
export type AiTask = {
    id: string;
    key: string;
    group: string;
    cacheKey?: string;
    title: string;
    subtitle?: string;
    href?: AiTaskHref;
    kind: AiTaskKind;
    status: AiTaskStatus;
    createdAt: number;
    finishedAt?: number;
    text?: string;
    summary?: string;
    error?: string;
    /** 完成时用户是否正看着对应页面（看得到就不再弹通知） */
    seen: boolean;
};

export type AiTaskRunContext = {
    signal: AbortSignal;
    /** 流式请求用它把当前累计文本交给任务中心 */
    report: (text: string) => void;
};

export type StartAiTaskOptions<T> = {
    /** 同一个 key 正在跑时会复用，不会重复请求 */
    key: string;
    title: string;
    subtitle?: string;
    /** 归属分组，页面打开期间用 attend(group) 抑制完成通知 */
    group?: string;
    /** 成功后写入 AI 缓存 */
    cacheKey?: string;
    href?: AiTaskHref;
    kind?: AiTaskKind;
    /** 强制重跑：先取消同 key 的旧任务 */
    force?: boolean;
    summarize?: (value: T) => string;
    run: (context: AiTaskRunContext) => Promise<T>;
};

export type AiTaskStoreDeps = {
    saveCache?: (key: string, value: unknown) => void;
    now?: () => number;
};

export type AiTaskStore = ReturnType<typeof createAiTaskStore>;

type InternalTask = AiTask & {
    seq: number;
    controller: AbortController;
    promise: Promise<unknown>;
    result?: unknown;
    settled: boolean;
    /** 保存启动参数，供任务中心的「重试」原样再跑一次 */
    options: StartAiTaskOptions<unknown>;
};

const MAX_FINISHED = 20;
const MAX_RESULTS = 50;
const MAX_TEXT = 200_000;
const PROGRESS_DELAY = 120;

/**
 * AI 后台任务队列。组件关掉后任务继续跑，结果写缓存并通知。
 * 纯逻辑，不依赖 React，方便单测。
 */
export function createAiTaskStore(deps: AiTaskStoreDeps = {}) {
    const now = deps.now ?? (() => Date.now());
    const tasks = new Map<string, InternalTask>();
    /** 只在任务运行期间存在的 key -> id 索引，用于去重 */
    const runningByKey = new Map<string, string>();
    const results = new Map<string, unknown>();
    const attendance = new Map<string, number>();
    const listeners = new Set<() => void>();

    let seq = 0;
    let snapshot: AiTask[] = [];
    let progressTimer: ReturnType<typeof setTimeout> | null = null;

    const publicTask = (task: InternalTask): AiTask => ({
        id: task.id,
        key: task.key,
        group: task.group,
        cacheKey: task.cacheKey,
        title: task.title,
        subtitle: task.subtitle,
        href: task.href,
        kind: task.kind,
        status: task.status,
        createdAt: task.createdAt,
        finishedAt: task.finishedAt,
        text: task.text,
        summary: task.summary,
        error: task.error,
        seen: task.seen,
    });

    const emit = () => {
        if (progressTimer) {
            clearTimeout(progressTimer);
            progressTimer = null;
        }
        snapshot = [...tasks.values()]
            .sort((a, b) => b.seq - a.seq)
            .map(publicTask);
        listeners.forEach((listener) => listener());
    };

    /** 流式输出很密，最多每 120ms 刷新一次订阅者 */
    const emitSoon = () => {
        if (progressTimer) return;
        progressTimer = setTimeout(() => {
            progressTimer = null;
            emit();
        }, PROGRESS_DELAY);
    };

    const isAttended = (group: string) => (attendance.get(group) ?? 0) > 0;

    const prune = () => {
        const finished = [...tasks.values()]
            .filter((task) => task.status !== "running")
            .sort((a, b) => a.seq - b.seq);
        while (finished.length > MAX_FINISHED) {
            const oldest = finished.shift();
            if (oldest) tasks.delete(oldest.id);
        }
        while (results.size > MAX_RESULTS) {
            const oldestKey = results.keys().next().value;
            if (typeof oldestKey !== "string") break;
            results.delete(oldestKey);
        }
    };

    const settle = (task: InternalTask) => {
        if (task.settled) return;
        task.settled = true;
        if (runningByKey.get(task.key) === task.id) {
            runningByKey.delete(task.key);
        }
        prune();
        emit();
    };

    const cancelTask = (task: InternalTask) => {
        if (task.status !== "running") return;
        task.status = "canceled";
        task.finishedAt = now();
        task.seen = true;
        task.controller.abort();
        settle(task);
    };

    const start = <T>(options: StartAiTaskOptions<T>): Promise<T> => {
        const existingId = runningByKey.get(options.key);
        if (existingId && !options.force) {
            const existing = tasks.get(existingId);
            if (existing?.status === "running") {
                return existing.promise as Promise<T>;
            }
        }
        if (existingId) {
            const existing = tasks.get(existingId);
            if (existing) cancelTask(existing);
        }

        seq += 1;
        const id = `ai-${now()}-${seq}`;
        const controller = new AbortController();
        const task: InternalTask = {
            id,
            key: options.key,
            group: options.group ?? options.key,
            cacheKey: options.cacheKey,
            title: options.title,
            subtitle: options.subtitle,
            // 每个任务都带一个可回去的页面，完成的结果才不会「看得到却打不开」。
            href: options.href ?? "/home",
            kind: options.kind ?? "json",
            status: "running",
            createdAt: now(),
            seen: false,
            seq,
            controller,
            promise: Promise.resolve(),
            settled: false,
            options: options as unknown as StartAiTaskOptions<unknown>,
        };
        tasks.set(id, task);
        runningByKey.set(options.key, id);
        emit();

        const promise = (async () => {
            try {
                const value = await options.run({
                    signal: controller.signal,
                    report: (text) => {
                        if (task.status !== "running") return;
                        task.text = text.slice(0, MAX_TEXT);
                        emitSoon();
                    },
                });

                // 已被取消（比如相同 key 被强制重跑）就不再覆盖状态
                if (task.status === "canceled") return value;

                task.result = value;
                if (options.cacheKey) {
                    try {
                        deps.saveCache?.(options.cacheKey, value);
                    } catch {
                        // 缓存写失败不影响这次任务本身
                    }
                }
                results.set(options.key, value);
                if (typeof value === "string") task.text = value;
                try {
                    task.summary = options.summarize?.(value);
                } catch {
                    task.summary = undefined;
                }
                task.status = "done";
                task.finishedAt = now();
                task.seen = isAttended(task.group);
                settle(task);
                return value;
            } catch (error) {
                if (task.status !== "canceled" && !isAiCanceled(error)) {
                    task.error = aiErrorText(error);
                    task.status = "error";
                    task.finishedAt = now();
                    task.seen = isAttended(task.group);
                }
                settle(task);
                throw error;
            }
        })();

        task.promise = promise;
        return promise;
    };

    return {
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        getSnapshot() {
            return snapshot;
        },
        start,
        /** 传任务 id 或 key 都可以 */
        cancel(idOrKey: string) {
            const task =
                tasks.get(idOrKey) ??
                tasks.get(runningByKey.get(idOrKey) ?? "");
            if (task) cancelTask(task);
        },
        dismiss(id: string) {
            const task = tasks.get(id);
            if (!task || task.status === "running") return;
            tasks.delete(id);
            emit();
        },
        /** 用原来的参数强制重跑一个失败/取消的任务（任务中心的「重试」）。 */
        retry(idOrKey: string) {
            const task =
                tasks.get(idOrKey) ??
                tasks.get(runningByKey.get(idOrKey) ?? "");
            if (!task || task.status === "running") return;
            const options = task.options;
            tasks.delete(task.id);
            return start({ ...options, force: true });
        },
        clearFinished() {
            let changed = false;
            for (const [id, task] of tasks) {
                if (task.status !== "running") {
                    tasks.delete(id);
                    changed = true;
                }
            }
            if (changed) emit();
        },
        markAllSeen() {
            let changed = false;
            for (const task of tasks.values()) {
                if (
                    !task.seen &&
                    (task.status === "done" || task.status === "error")
                ) {
                    task.seen = true;
                    changed = true;
                }
            }
            if (changed) emit();
        },
        find(key: string) {
            let found: InternalTask | undefined;
            for (const task of tasks.values()) {
                if (task.key === key && (!found || task.seq > found.seq)) {
                    found = task;
                }
            }
            return found ? publicTask(found) : undefined;
        },
        getResult<T>(key: string): T | undefined {
            return results.get(key) as T | undefined;
        },
        /** 返回的 release 必须在页面/面板关闭时调用 */
        attend(group: string) {
            attendance.set(group, (attendance.get(group) ?? 0) + 1);
            return () => {
                const next = (attendance.get(group) ?? 0) - 1;
                if (next <= 0) attendance.delete(group);
                else attendance.set(group, next);
            };
        },
        abortAll() {
            for (const task of tasks.values()) cancelTask(task);
        },
    };
}
