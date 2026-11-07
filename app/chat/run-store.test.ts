import { describe, expect, test } from "bun:test";

import {
    beginChatRun,
    endChatRun,
    getChatRunFiles,
    getChatRunSnapshot,
    getRunningConversationIds,
    isChatRunActive,
    pruneChatRunOptimistic,
    setChatRunLive,
    stopChatRun,
    updateChatRunOptimistic,
    watchChatRun,
} from "./run-store";
import type { ChatMessage } from "./types";

function message(
    id: string,
    seq: number,
    conversationId = "conv",
): ChatMessage {
    return {
        id,
        conversationId,
        role: "assistant",
        parts: [],
        content: "",
        model: "m",
        seq,
        status: "complete",
        createdAt: "",
    };
}

describe("chat run store", () => {
    test("keeps state after the conversation page unmounts", () => {
        const id = "run-store-unwatched";
        const unwatch = watchChatRun(id);
        beginChatRun(id, new AbortController(), { "notes.md": "hi" });
        updateChatRunOptimistic(id, (previous) => [
            ...previous,
            message("m1", 1, id),
        ]);
        setChatRunLive(id, {
            id: "live",
            parts: [{ type: "text", text: "工作目录" }],
        });
        unwatch();

        const snapshot = getChatRunSnapshot(id);
        expect(snapshot.running).toBe(true);
        expect(snapshot.live?.parts).toEqual([
            { type: "text", text: "工作目录" },
        ]);
        expect(snapshot.optimistic.map((row) => row.id)).toEqual(["m1"]);
        expect(getChatRunFiles(id)).toEqual({ "notes.md": "hi" });
        expect(isChatRunActive(id)).toBe(true);

        // Finish while watched so the background-completion toast stays quiet.
        const unwatchAgain = watchChatRun(id);
        endChatRun(id, "done", "测试");
        unwatchAgain();
        expect(isChatRunActive(id)).toBe(false);
        expect(getChatRunSnapshot(id).live).toBeNull();
    });

    test("drops only the optimistic rows the message query has", () => {
        const id = "run-store-prune";
        const unwatch = watchChatRun(id);
        beginChatRun(id, new AbortController(), {});
        updateChatRunOptimistic(id, () => [
            message("m1", 1, id),
            message("m2", 2, id),
        ]);

        pruneChatRunOptimistic(id, new Set(["m1"]));
        expect(getChatRunSnapshot(id).optimistic.map((row) => row.id)).toEqual([
            "m2",
        ]);

        pruneChatRunOptimistic(id, new Set(["m1", "m2"]));
        expect(getChatRunSnapshot(id).optimistic).toEqual([]);
        endChatRun(id, "done", "测试");
        unwatch();
    });

    test("stop aborts the run's controller", () => {
        const id = "run-store-stop";
        const controller = new AbortController();
        const unwatch = watchChatRun(id);
        beginChatRun(id, controller, {});
        stopChatRun(id);
        expect(controller.signal.aborted).toBe(true);
        endChatRun(id, "stopped", "测试");
        unwatch();
    });

    test("running-id snapshot tracks runs and stays stable across token publishes", () => {
        const a = "run-store-ids-a";
        const b = "run-store-ids-b";
        const watchA = watchChatRun(a);
        const watchB = watchChatRun(b);

        expect(getRunningConversationIds().size).toBe(0);

        beginChatRun(a, new AbortController(), {});
        expect([...getRunningConversationIds()]).toEqual([a]);

        beginChatRun(b, new AbortController(), {});
        const both = getRunningConversationIds();
        expect([...both]).toEqual([a, b]);

        // Streaming tokens publish constantly but never change membership:
        // the list must keep getting the same reference (no re-render).
        setChatRunLive(a, { id: "live", parts: [] });
        expect(getRunningConversationIds()).toBe(both);

        endChatRun(a, "done", "测试");
        expect([...getRunningConversationIds()]).toEqual([b]);
        endChatRun(b, "done", "测试");
        expect(getRunningConversationIds().size).toBe(0);

        watchA();
        watchB();
    });
});
