import { beforeEach, describe, expect, test } from "bun:test";

import {
    clearInterruptibleTask,
    readInterruptibleTasks,
    type InterruptedTaskEntry,
} from "./interrupted";
import { createAiTaskStore } from "./task-store";

let ledger: Map<string, string>;

beforeEach(() => {
    ledger = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
        getItem: (key: string) => ledger.get(key) ?? null,
        setItem: (key: string, value: string) => ledger.set(key, String(value)),
        removeItem: (key: string) => ledger.delete(key),
        clear: () => ledger.clear(),
    };
});

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

    test("每个任务都有一个可回去查看的 href（默认 /home，可覆盖）", async () => {
        const store = createAiTaskStore();
        await store.start({
            key: "a",
            title: "A",
            run: async () => "x",
        });
        await store.start({
            key: "b",
            title: "B",
            href: "/report",
            run: async () => "y",
        });
        const byKey = Object.fromEntries(
            store.getSnapshot().map((task) => [task.key, task.href]),
        );
        expect(byKey.a).toBe("/home");
        expect(byKey.b).toBe("/report");
    });

    test("retry 用原参数强制重跑一个失败任务", async () => {
        const store = createAiTaskStore();
        let calls = 0;
        const first = store.start({
            key: "retry-me",
            title: "会失败",
            run: async () => {
                calls += 1;
                if (calls === 1) throw new Error("boom");
                return "ok";
            },
        });
        await expect(first).rejects.toThrow("boom");
        const failed = store.getSnapshot()[0];
        expect(failed.status).toBe("error");

        const retried = store.retry(failed.id);
        expect(retried).toBeDefined();
        await expect(retried!).resolves.toBe("ok");
        expect(calls).toBe(2);
        // 旧失败任务被替换，新的那条已完成
        expect(store.getSnapshot().some((task) => task.id === failed.id)).toBe(
            false,
        );
        expect(store.getSnapshot()[0].status).toBe("done");
    });

    test("running tasks are recorded in the ledger, settled ones removed", async () => {
        const store = createAiTaskStore();
        const running = store.start({
            key: "ledgered",
            title: "年度小结",
            href: "/report",
            kind: "text",
            cacheKey: "report-cache",
            resume: { messages: [{ role: "user", content: "hi" }] },
            run: ({ signal }) => abortable<string>(signal),
        });

        const entry = readInterruptibleTasks().find(
            (item) => item.key === "ledgered",
        );
        expect(entry).toBeDefined();
        expect(entry?.resume?.messages).toEqual([
            { role: "user", content: "hi" },
        ]);

        store.cancel("ledgered");
        await expect(running).rejects.toMatchObject({ name: "AbortError" });
        expect(
            readInterruptibleTasks().find((item) => item.key === "ledgered"),
        ).toBeUndefined();
    });

    test("restoreInterrupted revives ledger rows as interrupted tasks", async () => {
        const store = createAiTaskStore();
        const entries: InterruptedTaskEntry[] = [
            {
                id: "ai-1-1",
                key: "killed",
                group: "killed",
                title: "被杀的任务",
                href: "/report",
                kind: "stream",
                createdAt: 1000,
                resume: { messages: [{ role: "user", content: "写年报" }] },
            },
            {
                id: "ai-1-2",
                key: "killed-json",
                group: "killed-json",
                title: "没有 prompt 的",
                kind: "json",
                createdAt: 1001,
            },
        ];

        expect(store.restoreInterrupted(entries)).toBe(2);
        const byId = new Map(
            store.getSnapshot().map((task) => [task.id, task]),
        );
        const first = byId.get("ai-1-1")!;
        const second = byId.get("ai-1-2")!;
        expect(first.status).toBe("interrupted");
        expect(first.resumable).toBe(true);
        expect(first.seen).toBe(false);
        expect(second.status).toBe("interrupted");
        expect(second.resumable).toBe(false);

        // 再恢复一次不会出现重复行
        expect(store.restoreInterrupted(entries)).toBe(0);
        expect(store.getSnapshot()).toHaveLength(2);

        store.markAllSeen();
        expect(store.getSnapshot().every((task) => task.seen)).toBe(true);

        store.dismiss(first.id);
        expect(
            readInterruptibleTasks().find((item) => item.id === "ai-1-1"),
        ).toBeUndefined();
    });

    test("restore skips entries whose key is already taken", async () => {
        const store = createAiTaskStore();
        const running = store.start({
            key: "taken",
            title: "已在跑",
            run: ({ signal }) => abortable<string>(signal),
        });

        expect(
            store.restoreInterrupted([
                {
                    id: "ai-9-9",
                    key: "taken",
                    group: "taken",
                    title: "过时台账",
                    kind: "text",
                    createdAt: 1000,
                },
            ]),
        ).toBe(0);
        expect(store.getSnapshot()).toHaveLength(1);
        // 过时的那条台账被清掉，但正在跑的任务自己的记录还在
        expect(
            readInterruptibleTasks().find((item) => item.id === "ai-9-9"),
        ).toBeUndefined();

        store.cancel("taken");
        await expect(running).rejects.toMatchObject({ name: "AbortError" });
    });

    test("retry on a resumable interrupted task re-runs the stored prompt", async () => {
        const store = createAiTaskStore({
            resumeRun: (payload) => async () =>
                payload.history
                    ? [...payload.history, { role: "assistant", content: "x" }]
                    : "模拟续跑文本",
        });
        store.restoreInterrupted([
            {
                id: "ai-2-1",
                key: "resumable",
                group: "resumable",
                title: "年度小结",
                href: "/report",
                kind: "text",
                createdAt: 1000,
                resume: { messages: [{ role: "user", content: "写年报" }] },
            },
        ]);

        const retried = store.retry("resumable");
        expect(retried).toBeDefined();
        await expect(retried!).resolves.toBe("模拟续跑文本");

        const done = store.getSnapshot()[0];
        expect(done.status).toBe("done");
        expect(done.text).toBe("模拟续跑文本");
        expect(done.summary).toBe("模拟续跑文本");
        // 续跑出来的任务再次记入台账，直到跑完被撤下
        expect(
            readInterruptibleTasks().find((item) => item.key === "resumable"),
        ).toBeUndefined();
    });

    test("retry on a non-resumable interrupted task does nothing", () => {
        const store = createAiTaskStore();
        store.restoreInterrupted([
            {
                id: "ai-3-1",
                key: "json-task",
                group: "json-task",
                title: "AI 批改",
                kind: "json",
                createdAt: 1000,
            },
        ]);
        expect(store.retry("json-task")).toBeUndefined();
        expect(store.getSnapshot()).toHaveLength(1);
        expect(store.getSnapshot()[0].status).toBe("interrupted");
        clearInterruptibleTask("ai-3-1");
    });
});
