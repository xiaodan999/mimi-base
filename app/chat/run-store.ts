import { useSyncExternalStore } from "react";
import { toast } from "sonner";

import type { ChatMessage, ChatPart, SandboxFiles } from "./types";
import { cancelUserInputFor } from "./user-input";

/** The streaming draft of the assistant message being generated. */
export type LiveReply = {
    id: string;
    parts: ChatPart[];
};

export type ChatRunSnapshot = {
    running: boolean;
    live: LiveReply | null;
    /** Rows this run wrote that the message query may not have yet. */
    optimistic: readonly ChatMessage[];
    /** Sandbox files as of the latest tool result; null = conversation's. */
    sandboxFiles: SandboxFiles | null;
};

export type ChatRunOutcome = "done" | "error" | "stopped";

type RunEntry = {
    running: boolean;
    live: LiveReply | null;
    optimistic: ChatMessage[];
    sandboxFiles: SandboxFiles | null;
    controller: AbortController | null;
    /** Mounted conversation pages viewing this run. */
    watchers: number;
    snapshot: ChatRunSnapshot;
};

/**
 * A chat run must outlive its route: leaving the conversation (back gesture,
 * bottom nav, another chat) keeps the model loop and tool calls going, and
 * coming back re-attaches to the same stream. Every piece of run state that
 * used to live in `useChatSession`'s component state is kept here instead,
 * keyed by conversation id.
 *
 * This also makes the "one run per conversation" guard real: a remount can no
 * longer start a second run while the first one is still holding the server's
 * per-user sandbox slot (which surfaced as 沙箱正忙).
 */
const IDLE_ENTRY_LIMIT = 30;

const EMPTY: ChatRunSnapshot = Object.freeze({
    running: false,
    live: null,
    optimistic: [],
    sandboxFiles: null,
});

const entries = new Map<string, RunEntry>();
const listeners = new Set<() => void>();

function notify() {
    for (const listener of listeners) listener();
}

function entryFor(conversationId: string): RunEntry {
    const existing = entries.get(conversationId);
    if (existing) return existing;

    if (entries.size >= IDLE_ENTRY_LIMIT) {
        // Map iteration is insertion order: drop the oldest idle entries.
        for (const [id, candidate] of entries) {
            if (!candidate.running && candidate.watchers === 0) {
                entries.delete(id);
                if (entries.size < IDLE_ENTRY_LIMIT) break;
            }
        }
    }

    const entry: RunEntry = {
        running: false,
        live: null,
        optimistic: [],
        sandboxFiles: null,
        controller: null,
        watchers: 0,
        snapshot: EMPTY,
    };
    entries.set(conversationId, entry);
    return entry;
}

function publish(entry: RunEntry) {
    entry.snapshot = {
        running: entry.running,
        live: entry.live,
        optimistic: entry.optimistic,
        sandboxFiles: entry.sandboxFiles,
    };
    notify();
}

function pruneIfIdle(conversationId: string) {
    const entry = entries.get(conversationId);
    if (!entry) return;
    if (entry.running || entry.watchers > 0 || entry.optimistic.length > 0) {
        return;
    }
    entries.delete(conversationId);
}

export function subscribeChatRuns(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function getChatRunSnapshot(conversationId: string): ChatRunSnapshot {
    return entries.get(conversationId)?.snapshot ?? EMPTY;
}

/** Subscribe a mounted conversation page to its run. */
export function useChatRun(conversationId: string): ChatRunSnapshot {
    return useSyncExternalStore(
        subscribeChatRuns,
        () => getChatRunSnapshot(conversationId),
        () => getChatRunSnapshot(conversationId),
    );
}

/** A page is open on this conversation; suppress the finished-in-background toast. */
export function watchChatRun(conversationId: string): () => void {
    const entry = entryFor(conversationId);
    entry.watchers += 1;
    return () => {
        const current = entries.get(conversationId);
        if (!current) return;
        current.watchers = Math.max(0, current.watchers - 1);
        pruneIfIdle(conversationId);
    };
}

export function isChatRunActive(conversationId: string): boolean {
    return entries.get(conversationId)?.running === true;
}

/** Claim the conversation's run slot synchronously, before any await. */
export function beginChatRun(
    conversationId: string,
    controller: AbortController,
    files: SandboxFiles,
): void {
    const entry = entryFor(conversationId);
    entry.controller = controller;
    entry.running = true;
    entry.live = null;
    entry.sandboxFiles = { ...files };
    publish(entry);
}

export function endChatRun(
    conversationId: string,
    outcome: ChatRunOutcome,
    title: string,
): void {
    const entry = entries.get(conversationId);
    if (!entry) return;
    entry.running = false;
    entry.live = null;
    entry.controller = null;
    publish(entry);

    // The user is elsewhere: tell them the answer they left running is ready.
    if (entry.watchers === 0 && outcome !== "stopped") {
        if (outcome === "error") {
            toast.error("回复失败", {
                description: `「${title}」的回复出错了，回去看看`,
                id: `chat-run-${conversationId}`,
            });
        } else {
            toast.success("回复完成", {
                description: `「${title}」有新回复`,
                id: `chat-run-${conversationId}`,
            });
        }
    }

    pruneIfIdle(conversationId);
}

export function setChatRunLive(
    conversationId: string,
    live: LiveReply | null,
): void {
    const entry = entryFor(conversationId);
    entry.live = live;
    publish(entry);
}

export function appendChatRunMessage(
    conversationId: string,
    message: ChatMessage,
): void {
    updateChatRunOptimistic(conversationId, (previous) => [
        ...previous,
        message,
    ]);
}

export function updateChatRunOptimistic(
    conversationId: string,
    update: (previous: ChatMessage[]) => ChatMessage[],
): void {
    const entry = entryFor(conversationId);
    entry.optimistic = update(entry.optimistic);
    publish(entry);
}

/**
 * Drop optimistic copies once the message query has the real rows. Called
 * with whatever the thread currently sees, so it is safe to prune partially.
 */
export function pruneChatRunOptimistic(
    conversationId: string,
    storedIds: ReadonlySet<string>,
): void {
    const entry = entries.get(conversationId);
    if (!entry || entry.optimistic.length === 0) return;
    const next = entry.optimistic.filter(
        (message) => !storedIds.has(message.id),
    );
    if (next.length === entry.optimistic.length) return;
    entry.optimistic = next;
    publish(entry);
    pruneIfIdle(conversationId);
}

export function getChatRunFiles(conversationId: string): SandboxFiles | null {
    return entries.get(conversationId)?.sandboxFiles ?? null;
}

export function setChatRunFiles(
    conversationId: string,
    files: SandboxFiles,
): void {
    const entry = entryFor(conversationId);
    entry.sandboxFiles = files;
    publish(entry);
}

/** Explicit stop from the UI; the loop persists its partial reply. */
export function stopChatRun(conversationId: string): void {
    const entry = entries.get(conversationId);
    cancelUserInputFor(conversationId, "用户停止了生成");
    entry?.controller?.abort();
}

/** Leaving the app shell (logout) must not leave runs or questions behind. */
export function abortAllChatRuns(): void {
    for (const [conversationId, entry] of entries) {
        // The transient reason keeps a reload/resume question open instead of
        // persisting it as a failed tool call.
        cancelUserInputFor(conversationId, "用户离开了当前页面");
        entry.controller?.abort();
    }
}
