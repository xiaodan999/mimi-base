import { beforeEach, describe, expect, test } from "bun:test";

import {
    clearInterruptibleTask,
    markInterruptibleRestored,
    readInterruptibleTasks,
    recordInterruptibleTask,
    type InterruptedTaskEntry,
} from "./interrupted";

let store: Map<string, string>;

beforeEach(() => {
    store = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, String(value)),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
    };
});

function entry(id: string, overrides: Partial<InterruptedTaskEntry> = {}) {
    return {
        id,
        key: `key-${id}`,
        group: `key-${id}`,
        title: `任务 ${id}`,
        kind: "text" as const,
        createdAt: 1000,
        ...overrides,
    };
}

describe("interrupted task ledger", () => {
    test("records, reads and clears entries", () => {
        recordInterruptibleTask(entry("a"));
        recordInterruptibleTask(entry("b", { resume: { messages: [] } }));

        expect(readInterruptibleTasks().map((item) => item.id)).toEqual([
            "b",
            "a",
        ]);

        clearInterruptibleTask("a");
        const rest = readInterruptibleTasks();
        expect(rest.map((item) => item.id)).toEqual(["b"]);
        expect(rest[0].resume).toEqual({ messages: [] });
    });

    test("clearing an unknown id is a no-op", () => {
        clearInterruptibleTask("nope");
        expect(readInterruptibleTasks()).toEqual([]);
    });

    test("keeps only the newest entries", () => {
        for (let index = 0; index < 15; index++) {
            recordInterruptibleTask(entry(`t-${index}`));
        }
        const entries = readInterruptibleTasks();
        expect(entries).toHaveLength(10);
        expect(entries[0].id).toBe("t-14");
    });

    test("markInterruptibleRestored stamps the given ids once", () => {
        recordInterruptibleTask(entry("a"));
        recordInterruptibleTask(entry("b"));

        markInterruptibleRestored(["a"]);
        const byId = new Map(
            readInterruptibleTasks().map((item) => [item.id, item]),
        );
        expect(byId.get("a")?.restoredAt).toBeDefined();
        expect(byId.get("b")?.restoredAt).toBeUndefined();
    });

    test("corrupted storage reads back as empty and recovers on write", () => {
        store.set("mimi:ai-interrupted:v1", "{not json");
        expect(readInterruptibleTasks()).toEqual([]);

        recordInterruptibleTask(entry("a"));
        expect(readInterruptibleTasks().map((item) => item.id)).toEqual(["a"]);
    });
});
