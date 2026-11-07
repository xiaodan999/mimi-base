import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { buildApiMessages } from "@/app/chat/prompt";
import { messageText, previewText } from "@/app/chat/records";
import { streamChatCompletion, type StreamSnapshot } from "@/app/chat/stream";
import { deriveConversationTitle } from "@/app/chat/title";
import {
    executeChatTool,
    toolsForModel,
    type ToolHooks,
} from "@/app/chat/tools";
import type {
    ChatConversation,
    ChatMessage,
    ChatModel,
    ChatPart,
    ChatToolCallPart,
    SandboxFiles,
} from "@/app/chat/types";
import { cancelUserInput } from "@/app/chat/user-input";
import { useCurrentUser } from "@/lib/auth";
import { qk } from "@/lib/query-keys";

import { chatMemoriesQueryOptions, useChatActions } from "./-data";

/** One assistant turn may call tools several times; stop runaway loops. */
const MAX_TOOL_ROUNDS = 6;

export type LiveReply = {
    id: string;
    parts: ChatPart[];
};

function snapshotParts(snapshot: StreamSnapshot): ChatPart[] {
    const parts: ChatPart[] = [];
    if (snapshot.reasoning.trim() !== "") {
        parts.push({ type: "reasoning", text: snapshot.reasoning });
    }
    if (snapshot.content !== "") {
        parts.push({ type: "text", text: snapshot.content });
    }
    for (const [index, call] of snapshot.toolCalls.entries()) {
        parts.push({
            type: "tool-call",
            toolCallId: call.id || `call_${index + 1}`,
            toolName: call.name,
            argsText: call.argsText,
        });
    }
    return parts;
}

function withoutToolCalls(parts: readonly ChatPart[]): ChatPart[] {
    return parts.filter((part) => part.type !== "tool-call");
}

function uniqueCallId(
    call: { id: string },
    round: number,
    index: number,
): string {
    return call.id || `call_${round}_${index}_${Date.now().toString(36)}`;
}

function mergeById(
    stored: readonly ChatMessage[],
    optimistic: readonly ChatMessage[],
): ChatMessage[] {
    const seen = new Set(stored.map((message) => message.id));
    return [
        ...stored,
        ...optimistic.filter((message) => !seen.has(message.id)),
    ].sort((a, b) => a.seq - b.seq);
}

export type UseChatSessionArgs = {
    conversation: ChatConversation;
    storedMessages: readonly ChatMessage[];
    /** Resolved allowlisted model; undefined while the allowlist loads. */
    model: ChatModel | undefined;
};

/**
 * Owns one conversation's send / tool loop / persistence.
 *
 * A run is not aborted when the route unmounts: the async task keeps going
 * and writes its message, so switching tabs mid-answer does not lose it.
 * `stop()` is the explicit abort, and it persists the partial reply.
 */
export function useChatSession({
    conversation,
    storedMessages,
    model,
}: UseChatSessionArgs) {
    const actions = useChatActions();
    const queryClient = useQueryClient();
    const user = useCurrentUser();
    const [optimistic, setOptimistic] = useState<ChatMessage[]>([]);
    const [live, setLive] = useState<LiveReply | null>(null);
    const [running, setRunning] = useState(false);

    const conversationRef = useRef(conversation);
    conversationRef.current = conversation;
    const filesRef = useRef<SandboxFiles>(conversation.sandboxFiles);
    const abortRef = useRef<AbortController | null>(null);
    const runningRef = useRef(false);

    const messages = useMemo(
        () => mergeById(storedMessages, optimistic),
        [storedMessages, optimistic],
    );
    const messagesRef = useRef<ChatMessage[]>(messages);
    messagesRef.current = messages;

    // Drop optimistic copies once the query has the real rows.
    useEffect(() => {
        if (optimistic.length === 0) return;
        const storedIds = new Set(storedMessages.map((message) => message.id));
        if (optimistic.every((message) => storedIds.has(message.id))) {
            setOptimistic([]);
        }
    }, [storedMessages, optimistic]);

    // A pending ask_user request cannot survive leaving the page.
    useEffect(() => {
        return () => cancelUserInput("用户离开了当前页面");
    }, []);

    // Different conversation: reset local state and the sandbox snapshot.
    useEffect(() => {
        setOptimistic([]);
        setLive(null);
        setRunning(false);
        runningRef.current = false;
        cancelUserInput("对话已切换");
        abortRef.current?.abort();
        abortRef.current = null;
        filesRef.current = conversation.sandboxFiles;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversation.id]);

    /** Saved memories are read once per run and injected into the prompt. */
    const fetchMemories = useCallback(async (): Promise<string[]> => {
        try {
            const rows = await queryClient.fetchQuery(
                chatMemoriesQueryOptions(user.id),
            );
            return rows.map((row) => row.content);
        } catch {
            return [];
        }
    }, [queryClient, user.id]);

    const runAssistant = useCallback(
        async (
            baseHistory: ChatMessage[],
            modelInfo: ChatModel,
            startSeq: number,
            controller: AbortController,
        ) => {
            const conversationId = conversationRef.current.id;
            let history = baseHistory;
            let seq = startSeq;
            const memories = await fetchMemories();

            for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
                if (controller.signal.aborted) break;
                const liveId = `live-${round}-${Date.now().toString(36)}`;
                setLive({ id: liveId, parts: [] });

                let result;
                let partial: StreamSnapshot = {
                    content: "",
                    reasoning: "",
                    toolCalls: [],
                };
                try {
                    result = await streamChatCompletion({
                        model: modelInfo.id,
                        messages: buildApiMessages(
                            history,
                            conversationRef.current.personaPrompt,
                            { memories },
                        ),
                        reasoningEffort: modelInfo.thinkingLevels.includes(
                            conversationRef.current.thinking,
                        )
                            ? conversationRef.current.thinking
                            : undefined,
                        tools: toolsForModel(modelInfo),
                        signal: controller.signal,
                        onDelta: (snapshot) => {
                            partial = snapshot;
                            setLive({
                                id: liveId,
                                parts: snapshotParts(snapshot),
                            });
                        },
                    });
                } catch (error) {
                    const message =
                        error instanceof Error
                            ? error.message
                            : "AI 请求失败，再试一次吧";
                    const partialParts = snapshotParts(partial);
                    const saved = await actions
                        .createMessage({
                            conversationId,
                            role: "assistant",
                            parts: partialParts,
                            content: partial.content,
                            model: modelInfo.id,
                            seq: seq++,
                            status: "error",
                            error: message,
                        })
                        .catch(() => null);
                    if (saved) {
                        setOptimistic((previous) => [...previous, saved]);
                    }
                    // Drop the live draft only after the persisted row (or the
                    // optimistic copy) is in the list. Clearing it first made
                    // the answer disappear for a frame on mobile.
                    setLive(null);
                    break;
                }

                const parts = snapshotParts(result);
                const content = result.content;
                const hasBody =
                    content !== "" ||
                    result.reasoning.trim() !== "" ||
                    result.toolCalls.length > 0;

                const saved = await actions.createMessage({
                    conversationId,
                    role: "assistant",
                    parts,
                    content,
                    model: modelInfo.id,
                    seq: seq++,
                    status: result.aborted ? "stopped" : "complete",
                    ...(!hasBody && !result.aborted
                        ? { error: "AI 没有返回内容，再试一次吧" }
                        : {}),
                    ...(result.usage ? { usage: result.usage } : {}),
                });
                setOptimistic((previous) => [...previous, saved]);
                setLive(null);
                history = [...history, saved];

                if (result.aborted || result.toolCalls.length === 0) {
                    if (content !== "") {
                        void actions.updateConversation(conversationId, {
                            lastMessage: previewText(content),
                        });
                    }
                    break;
                }

                // Execute the sandbox tools, then let the model read the
                // results in a follow-up round (a new assistant message).
                const callParts: ChatToolCallPart[] = result.toolCalls.map(
                    (call, index) => ({
                        type: "tool-call",
                        toolCallId: uniqueCallId(call, round, index),
                        toolName: call.name,
                        argsText: call.argsText,
                    }),
                );
                const baseParts = withoutToolCalls(parts);
                const executed: ChatToolCallPart[] = [];
                setOptimistic((previous) =>
                    previous.map((message) =>
                        message.id === saved.id
                            ? {
                                  ...message,
                                  parts: [...baseParts, ...callParts],
                              }
                            : message,
                    ),
                );

                const toolHooks: ToolHooks = {
                    onExpenseSaved: () => {
                        void queryClient.invalidateQueries({
                            queryKey: qk.jiZhang.all,
                        });
                    },
                    onMemoryChanged: () => {
                        void queryClient.invalidateQueries({
                            queryKey: qk.chat.memories(user.id),
                        });
                    },
                };
                for (const call of callParts) {
                    if (controller.signal.aborted) break;
                    const outcome = await executeChatTool(
                        call.toolName,
                        call.argsText,
                        filesRef.current,
                        toolHooks,
                    );
                    filesRef.current = outcome.files;
                    executed.push({
                        ...call,
                        result: outcome.result,
                        isError: outcome.isError,
                    });
                    setOptimistic((previous) =>
                        previous.map((message) =>
                            message.id === saved.id
                                ? {
                                      ...message,
                                      parts: [...baseParts, ...executed],
                                  }
                                : message,
                        ),
                    );
                }

                const finalParts: ChatPart[] = [
                    ...baseParts,
                    ...(executed.length > 0 ? executed : callParts),
                ];
                await actions
                    .updateMessage(saved.id, conversationId, {
                        parts: finalParts,
                        content,
                        status: controller.signal.aborted
                            ? "stopped"
                            : "complete",
                    })
                    .catch(() => {});
                await actions
                    .updateConversation(conversationId, {
                        sandboxFiles: filesRef.current,
                    })
                    .catch(() => {});
                if (controller.signal.aborted) break;

                history = [
                    ...history.slice(0, -1),
                    { ...saved, parts: finalParts },
                ];
            }
        },
        [actions, fetchMemories, queryClient, user.id],
    );

    const send = useCallback(
        async (parts: ChatPart[]) => {
            if (runningRef.current) return;
            const current = conversationRef.current;
            const userContent = messageText(parts);
            // Only the untouched default title is replaced: a rename made
            // before the first send (or a still-loading history) must win.
            const firstMessage =
                messagesRef.current.length === 0 && current.title === "新对话";
            const modelInfo = model;
            const seq = await actions.nextSeq(current.id);

            const userMessage = await actions.createMessage({
                conversationId: current.id,
                role: "user",
                parts,
                content: userContent,
                model: modelInfo?.id ?? current.model,
                seq,
                status: "complete",
            });
            setOptimistic((previous) => [...previous, userMessage]);

            await actions
                .updateConversation(current.id, {
                    lastMessage: previewText(userContent),
                    ...(firstMessage
                        ? { title: deriveConversationTitle(userContent) }
                        : {}),
                })
                .catch(() => {});

            if (!modelInfo) {
                await actions
                    .createMessage({
                        conversationId: current.id,
                        role: "assistant",
                        parts: [],
                        content: "",
                        model: current.model,
                        seq: seq + 1,
                        status: "error",
                        error: "站点没有可用的聊天模型，请联系管理员",
                    })
                    .catch(() => {});
                return;
            }

            const controller = new AbortController();
            abortRef.current = controller;
            runningRef.current = true;
            setRunning(true);
            try {
                await runAssistant(
                    [...messagesRef.current, userMessage],
                    modelInfo,
                    seq + 1,
                    controller,
                );
            } finally {
                cancelUserInput("生成已结束");
                runningRef.current = false;
                setRunning(false);
                setLive(null);
                abortRef.current = null;
            }
        },
        [actions, model, runAssistant],
    );

    /**
     * Regenerate the reply that follows `parentId` (the user message). The UI
     * only offers this on the last assistant message, so dropping everything
     * after that point cannot delete a later turn.
     */
    const regenerate = useCallback(
        async (parentId: string) => {
            if (runningRef.current) return;
            const list = messagesRef.current;
            const parent =
                list.find(
                    (message) =>
                        message.id === parentId && message.role === "user",
                ) ??
                [...list].reverse().find((message) => message.role === "user");
            if (!parent) return;
            if (!model) return;

            const history = list.filter((message) => message.seq <= parent.seq);
            setOptimistic((previous) =>
                previous.filter((message) => message.seq <= parent.seq),
            );
            await actions.deleteMessagesAfter(
                conversationRef.current.id,
                parent.seq,
            );

            const controller = new AbortController();
            abortRef.current = controller;
            runningRef.current = true;
            setRunning(true);
            try {
                await runAssistant(history, model, parent.seq + 1, controller);
            } finally {
                cancelUserInput("生成已结束");
                runningRef.current = false;
                setRunning(false);
                setLive(null);
                abortRef.current = null;
            }
        },
        [actions, model, runAssistant],
    );

    const stop = useCallback(() => {
        cancelUserInput("用户停止了生成");
        abortRef.current?.abort();
    }, []);

    return {
        messages,
        live,
        running,
        send,
        stop,
        regenerate,
        /** Sandbox files as of the latest tool run (for the header sheet). */
        sandboxFiles: filesRef.current,
    };
}
