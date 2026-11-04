import { describe, expect, test } from "bun:test";

import { createAiTaskStore } from "./task-store";

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function abortable<T>(signal: AbortSignal): Promise<T> {
    return new Promise<T>((_, reject) => {
        signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
        );
    });
}

describe("AI task store", () => {
    test("finishes a task, writes the cache and keeps the result", async () => {
        const cache: [string, unknown][] = [];
        const store = createAiTaskStore({
            saveCache: (key, value) => cache.push([key, value]),
            now: () => 1000,
        });

        const result = deferred<string>();
        const promise = store.start({
            key: "report",
            title: "年度小结",
            cacheKey: "report-cache",
            kind: "text",
            summarize: (value) => `写了 ${value.length} 个字`,
            run: () => result.promise,
        });

        expect(store.getSnapshot()).toHaveLength(1);
        expect(store.getSnapshot()[0].status).toBe("running");

        result.resolve("hello");
        await expect(promise).resolves.toBe("hello");

        const task = store.getSnapshot()[0];
        expect(task.status).toBe("done");
        expect(task.text).toBe("hello");
        expect(task.summary).toBe("写了 5 个字");
        expect(task.seen).toBe(false);
        expect(cache).toEqual([["report-cache", "hello"]]);
        expect(store.getResult<string>("report")).toBe("hello");
    });

    test("dedupes the same key while it is running", async () => {
        const store = createAiTaskStore();
        const result = deferred<string>();
        let calls = 0;

        const first = store.start({
            key: "same",
            title: "任务",
            run: () => {
                calls += 1;
                return result.promise;
            },
        });
        const second = store.start({
            key: "same",
            title: "任务",
            run: () => {
                calls += 1;
                return result.promise;
            },
        });

        expect(calls).toBe(1);
        expect(first).toBe(second);

        result.resolve("ok");
        await expect(first).resolves.toBe("ok");
        expect(store.getSnapshot()).toHaveLength(1);
    });

    test("force cancels the previous run and starts a new one", async () => {
        const store = createAiTaskStore();
        let calls = 0;

        const first = store.start({
            key: "same",
            title: "旧任务",
            run: ({ signal }) => {
                calls += 1;
                return abortable<string>(signal);
            },
        });
        const second = store.start({
            key: "same",
            title: "新任务",
            force: true,
            run: async () => {
                calls += 1;
                return "fresh";
            },
        });

        await expect(first).rejects.toMatchObject({ name: "AbortError" });
        await expect(second).resolves.toBe("fresh");
        expect(calls).toBe(2);

        const tasks = store.getSnapshot();
        expect(tasks).toHaveLength(2);
        expect(tasks[0].title).toBe("新任务");
        expect(tasks[0].status).toBe("done");
        expect(tasks[1].status).toBe("canceled");
    });

    test("records errors without writing the cache", async () => {
        const cache: string[] = [];
        const store = createAiTaskStore({
            saveCache: (key) => cache.push(key),
        });

        await expect(
            store.start({
                key: "bad",
                title: "批改",
                cacheKey: "bad-cache",
                run: async () => {
                    throw new Error("boom");
                },
            }),
        ).rejects.toThrow("boom");

        const task = store.getSnapshot()[0];
        expect(task.status).toBe("error");
        expect(task.error).toBe("boom");
        expect(task.seen).toBe(false);
        expect(cache).toEqual([]);
    });

    test("cancel marks the task canceled and seen", async () => {
        const store = createAiTaskStore();
        const promise = store.start({
            key: "cancel-me",
            title: "问基地",
            run: ({ signal }) => abortable<string>(signal),
        });

        store.cancel("cancel-me");

        await expect(promise).rejects.toMatchObject({ name: "AbortError" });
        const task = store.getSnapshot()[0];
        expect(task.status).toBe("canceled");
        expect(task.seen).toBe(true);
    });

    test("tasks finishing while attended are marked seen", async () => {
        const store = createAiTaskStore();
        const release = store.attend("panel");

        await store.start({
            key: "attended",
            group: "panel",
            title: "面板里",
            run: async () => "done",
        });

        expect(store.getSnapshot()[0].seen).toBe(true);
        release();
    });

    test("keeps only the newest finished tasks", async () => {
        const store = createAiTaskStore();
        for (let index = 0; index < 25; index++) {
            await store.start({
                key: `task-${index}`,
                title: `任务 ${index}`,
                run: async () => index,
            });
        }

        expect(store.getSnapshot().length).toBeLessThanOrEqual(20);
        expect(store.getSnapshot()[0].title).toBe("任务 24");
    });

    test("clearFinished removes finished tasks but keeps running ones", async () => {
        const store = createAiTaskStore();
        await store.start({
            key: "done",
            title: "已完成",
            run: async () => true,
        });
        const running = store.start({
            key: "running",
            title: "进行中",
            run: ({ signal }) => abortable<string>(signal),
        });

        store.clearFinished();
        expect(store.getSnapshot()).toHaveLength(1);
        expect(store.getSnapshot()[0].status).toBe("running");

        store.cancel("running");
        await expect(running).rejects.toMatchObject({ name: "AbortError" });
    });

    test("markAllSeen only touches finished tasks", async () => {
        const store = createAiTaskStore();
        await store.start({
            key: "done",
            title: "已完成",
            run: async () => true,
        });
        const running = store.start({
            key: "running",
            title: "进行中",
            run: ({ signal }) => abortable<string>(signal),
        });

        store.markAllSeen();
        const [runningTask, doneTask] = store.getSnapshot();
        expect(doneTask.seen).toBe(true);
        expect(runningTask.seen).toBe(false);

        store.cancel("running");
        await expect(running).rejects.toMatchObject({ name: "AbortError" });
    });
});
