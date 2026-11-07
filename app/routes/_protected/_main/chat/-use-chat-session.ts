import { useCallback, useEffect, useMemo, useRef } from "react";
import type { AppendMessage } from "@assistant-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { buildApiMessages } from "@/app/chat/prompt";
import { messageText, previewText } from "@/app/chat/records";
import {
    appendChatRunMessage,
    beginChatRun,
    endChatRun,
    getChatRunFiles,
    isChatRunActive,
    pruneChatRunOptimistic,
    setChatRunFiles,
    setChatRunLive,
    stopChatRun,
    updateChatRunOptimistic,
    useChatRun,
    watchChatRun,
    type ChatRunOutcome,
} from "@/app/chat/run-store";
import { streamChatCompletion, type StreamSnapshot } from "@/app/chat/stream";
import { deriveConversationTitle } from "@/app/chat/title";
import { parseToolArgs } from "@/app/chat/tool-args";
import {
    executeChatTool,
    isInteractiveTool,
    pendingRequestFromToolCall,
    resolveInteractiveToolResult,
    toolsForModel,
    type ToolHooks,
} from "@/app/chat/tools";
import type {
    ChatArtifactPart,
    ChatConversation,
    ChatMessage,
    ChatModel,
    ChatPart,
    ChatToolCallPart,
} from "@/app/chat/types";
import {
    hasPendingUserInput,
    isTransientCancelReason,
    requestUserInput,
    usePendingUserInput,
    type UserInputRequest,
} from "@/app/chat/user-input";
import { useCurrentUser } from "@/lib/auth";
import { qk } from "@/lib/query-keys";

import { appendMessageParts } from "./-components/-chat-runtime";
import { chatMemoriesQueryOptions, useChatActions } from "./-data";

export type { LiveReply } from "@/app/chat/run-store";

/**
 * One assistant turn may call tools several times; stop runaway loops. The
 * round after the cap runs tool-free: with tools the run could just stop on
 * one more tool card, without them the model must wrap up into a text reply.
 */
const MAX_TOOL_ROUNDS = 6;

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

/** Surfaces a non-model failure (persistence/network) in the thread view. */
function toastRunFailure(conversationId: string, error: unknown) {
    toast.error("回复失败", {
        id: `chat-run-${conversationId}`,
        description:
            error instanceof Error && error.message !== ""
                ? error.message
                : "再试一次吧",
    });
}

function mergeById(
    stored: readonly ChatMessage[],
    optimistic: readonly ChatMessage[],
): ChatMessage[] {
    // The run's copy is the freshest while it is alive (the stored row can
    // still be the pre-tool version), so it wins per id.
    const optimisticById = new Map(
        optimistic.map((message) => [message.id, message]),
    );
    const merged = stored.map(
        (message) => optimisticById.get(message.id) ?? message,
    );
    const storedIds = new Set(stored.map((message) => message.id));
    for (const message of optimistic) {
        if (!storedIds.has(message.id)) merged.push(message);
    }
    return merged.sort((a, b) => a.seq - b.seq);
}

export type UseChatSessionArgs = {
    conversation: ChatConversation;
    /** Stored rows, already loaded by the route before the thread mounts. */
    storedMessages: readonly ChatMessage[];
    /** Resolved allowlisted model; undefined while the allowlist loads. */
    model: ChatModel | undefined;
};

/**
 * Owns one conversation's send / tool loop / persistence.
 *
 * The run itself is not tied to this component: its state lives in
 * `app/chat/run-store.ts`, so swiping back to another page keeps the model
 * loop and tool calls going. Re-entering the conversation re-attaches to the
 * same live draft and running state, and a second send is refused until the
 * first run ends. `stop()` is the explicit abort and persists the partial
 * reply.
 */
export function useChatSession({
    conversation,
    storedMessages,
    model,
}: UseChatSessionArgs) {
    const actions = useChatActions();
    const queryClient = useQueryClient();
    const user = useCurrentUser();
    const run = useChatRun(conversation.id);

    const conversationRef = useRef(conversation);
    conversationRef.current = conversation;
    /** Conversation id whose stored messages were already resume-scanned. */
    const scannedConversationRef = useRef<string | null>(null);

    // Mark this page as watching so a background finish does not toast here.
    useEffect(() => watchChatRun(conversation.id), [conversation.id]);

    const messages = useMemo(
        () => mergeById(storedMessages, run.optimistic),
        [storedMessages, run.optimistic],
    );
    const messagesRef = useRef<ChatMessage[]>(messages);
    messagesRef.current = messages;

    // Drop optimistic copies once the run has finished and the query has the
    // real rows. While the run is alive the optimistic row is the one the tool
    // loop keeps patching (call parts, results), so pruning it earlier would
    // freeze the tool cards until the round is persisted.
    useEffect(() => {
        if (run.running || run.optimistic.length === 0) return;
        pruneChatRunOptimistic(
            conversation.id,
            new Set(storedMessages.map((message) => message.id)),
        );
    }, [conversation.id, run.optimistic, run.running, storedMessages]);

    // Different conversation: allow the mount scan to run again. The old
    // conversation's run (and its pending question) keeps going in the store.
    useEffect(() => {
        scannedConversationRef.current = null;
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
        ): Promise<ChatRunOutcome> => {
            const conversationId = conversationRef.current.id;
            let history = baseHistory;
            let seq = startSeq;
            let outcome: ChatRunOutcome = "done";
            const memories = await fetchMemories();
            let files = getChatRunFiles(conversationId) ?? {};

            for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
                if (controller.signal.aborted) {
                    outcome = "stopped";
                    break;
                }
                // Past the cap the model loses its tools: offering them again
                // would let the run end on yet another tool card with no
                // answer; without them it must reply from what it has.
                const allowTools = round < MAX_TOOL_ROUNDS;
                const liveId = `live-${round}-${Date.now().toString(36)}`;
                setChatRunLive(conversationId, { id: liveId, parts: [] });

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
                            { memories, wrapUp: !allowTools },
                        ),
                        reasoningEffort: modelInfo.thinkingLevels.includes(
                            conversationRef.current.thinking,
                        )
                            ? conversationRef.current.thinking
                            : undefined,
                        tools: allowTools
                            ? toolsForModel(modelInfo)
                            : undefined,
                        signal: controller.signal,
                        onDelta: (snapshot) => {
                            partial = snapshot;
                            setChatRunLive(conversationId, {
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
                    if (saved) appendChatRunMessage(conversationId, saved);
                    // Drop the live draft only after the persisted row (or the
                    // optimistic copy) is in the list. Clearing it first made
                    // the answer disappear for a frame on mobile.
                    setChatRunLive(conversationId, null);
                    outcome = controller.signal.aborted ? "stopped" : "error";
                    break;
                }

                // A tool call streamed on the tool-free wrap-up round cannot
                // run; drop it so the message never shows a card for code
                // that never executes.
                const toolCalls = allowTools ? result.toolCalls : [];
                const parts = snapshotParts({
                    content: result.content,
                    reasoning: result.reasoning,
                    toolCalls,
                });
                const content = result.content;
                const hasBody =
                    content !== "" ||
                    result.reasoning.trim() !== "" ||
                    toolCalls.length > 0;
                // `length` with nothing but reasoning: the thinking ate the
                // whole output cap and no answer exists — surface that
                // instead of saving a silently empty "complete" reply.
                const cutBeforeAnswer =
                    !result.aborted &&
                    toolCalls.length === 0 &&
                    content === "" &&
                    result.finishReason === "length";
                const failed = !result.aborted && (!hasBody || cutBeforeAnswer);

                const saved = await actions.createMessage({
                    conversationId,
                    role: "assistant",
                    parts,
                    content,
                    model: modelInfo.id,
                    seq: seq++,
                    status: result.aborted
                        ? "stopped"
                        : failed
                          ? "error"
                          : "complete",
                    ...(failed
                        ? {
                              error: cutBeforeAnswer
                                  ? "思考太长被截断了，没能写出回答，请重试一次"
                                  : "AI 没有返回内容，再试一次吧",
                          }
                        : {}),
                    ...(result.usage ? { usage: result.usage } : {}),
                });
                appendChatRunMessage(conversationId, saved);
                setChatRunLive(conversationId, null);
                history = [...history, saved];

                if (result.aborted) {
                    outcome = "stopped";
                } else if (failed) {
                    outcome = "error";
                }

                if (result.aborted || toolCalls.length === 0) {
                    if (content !== "") {
                        void actions.updateConversation(conversationId, {
                            lastMessage: previewText(content),
                        });
                    }
                    break;
                }

                // Execute the sandbox tools, then let the model read the
                // results in a follow-up round (a new assistant message).
                const callParts: ChatToolCallPart[] = toolCalls.map(
                    (call, index) => ({
                        type: "tool-call",
                        toolCallId: uniqueCallId(call, round, index),
                        toolName: call.name,
                        argsText: call.argsText,
                    }),
                );
                const baseParts = withoutToolCalls(parts);
                const executed: ChatToolCallPart[] = [];
                updateChatRunOptimistic(conversationId, (previous) =>
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
                    conversationId,
                    visionEnabled: modelInfo.vision,
                    createExpense: actions.createExpense,
                    saveArtifact: async ({ artifact }) =>
                        actions.createArtifact({
                            conversationId,
                            messageId: saved.id,
                            name: artifact.path,
                            mime: artifact.mime,
                            size: artifact.bytes,
                            base64: artifact.data,
                        }),
                    onMemoryChanged: () => {
                        void queryClient.invalidateQueries({
                            queryKey: qk.chat.memories(user.id),
                        });
                    },
                };
                const artifactParts: ChatArtifactPart[] = [];
                const truncated = result.finishReason === "length";
                for (const call of callParts) {
                    if (controller.signal.aborted) break;
                    const toolOutcome = await executeChatTool(
                        call.toolName,
                        call.argsText,
                        files,
                        toolHooks,
                        // The output was cut short: never rescue a half
                        // written file; report the cap so the model retries
                        // with less content.
                        { truncated },
                    );
                    files = toolOutcome.files;
                    setChatRunFiles(conversationId, files);
                    executed.push({
                        ...call,
                        // Canonical JSON: the raw streamed text may not parse,
                        // and later rounds replay it as tool_calls arguments.
                        ...(toolOutcome.argsText
                            ? { argsText: toolOutcome.argsText }
                            : {}),
                        result: toolOutcome.result,
                        isError: toolOutcome.isError,
                        ...(toolOutcome.resultImages &&
                        toolOutcome.resultImages.length > 0
                            ? { resultImages: toolOutcome.resultImages }
                            : {}),
                    });
                    if (toolOutcome.artifacts?.length) {
                        artifactParts.push(...toolOutcome.artifacts);
                    }
                    updateChatRunOptimistic(conversationId, (previous) =>
                        previous.map((message) =>
                            message.id === saved.id
                                ? {
                                      ...message,
                                      parts: [
                                          ...baseParts,
                                          ...executed,
                                          ...artifactParts,
                                      ],
                                  }
                                : message,
                        ),
                    );
                }

                const finalParts: ChatPart[] = [
                    ...baseParts,
                    ...(executed.length > 0 ? executed : callParts),
                    ...artifactParts,
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
                        sandboxFiles: files,
                    })
                    .catch(() => {});
                if (controller.signal.aborted) {
                    outcome = "stopped";
                    break;
                }

                history = [
                    ...history.slice(0, -1),
                    { ...saved, parts: finalParts },
                ];
            }
            return outcome;
        },
        [actions, fetchMemories, queryClient, user.id],
    );

    const send = useCallback(
        async (parts: ChatPart[]) => {
            const current = conversationRef.current;
            if (
                isChatRunActive(current.id) ||
                hasPendingUserInput(current.id)
            ) {
                return;
            }
            const userContent = messageText(parts);
            // Only the untouched default title is replaced: a rename made
            // before the first send (or a still-loading history) must win.
            const firstMessage =
                messagesRef.current.length === 0 && current.title === "新对话";
            const title = firstMessage
                ? deriveConversationTitle(userContent)
                : current.title;
            const modelInfo = model;
            const controller = new AbortController();
            beginChatRun(current.id, controller, current.sandboxFiles);
            let outcome: ChatRunOutcome = "error";

            try {
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
                appendChatRunMessage(current.id, userMessage);

                await actions
                    .updateConversation(current.id, {
                        lastMessage: previewText(userContent),
                        ...(firstMessage ? { title } : {}),
                    })
                    .catch(() => {});

                if (!modelInfo) {
                    const saved = await actions
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
                        .catch(() => null);
                    if (saved) appendChatRunMessage(current.id, saved);
                    return;
                }

                outcome = await runAssistant(
                    [...messagesRef.current, userMessage],
                    modelInfo,
                    seq + 1,
                    controller,
                );
            } catch (error) {
                outcome = "error";
                toastRunFailure(current.id, error);
            } finally {
                endChatRun(current.id, outcome, title);
            }
        },
        [actions, model, runAssistant],
    );

    /**
     * Regenerate the reply that follows `parentId`. `parentId` may be the user
     * message itself (assistant-ui's Reload) or the assistant reply to redo
     * (the 换模型重试 sheet) — both resolve to the same anchor user message.
     * `opts.model` retries with another allowlisted model without changing the
     * conversation's default.
     */
    const regenerate = useCallback(
        async (parentId: string, opts?: { model: ChatModel }) => {
            const current = conversationRef.current;
            if (
                isChatRunActive(current.id) ||
                hasPendingUserInput(current.id)
            ) {
                return;
            }
            const list = messagesRef.current;
            const anchor = list.find((message) => message.id === parentId);
            const parent =
                anchor?.role === "user"
                    ? anchor
                    : anchor
                      ? [...list]
                            .reverse()
                            .find(
                                (message) =>
                                    message.role === "user" &&
                                    message.seq < anchor.seq,
                            )
                      : [...list]
                            .reverse()
                            .find((message) => message.role === "user");
            if (!parent) return;
            if (!model) return;
            const runModel = opts?.model ?? model;
            const history = list.filter((message) => message.seq <= parent.seq);

            const controller = new AbortController();
            beginChatRun(current.id, controller, current.sandboxFiles);
            let outcome: ChatRunOutcome = "error";
            try {
                updateChatRunOptimistic(current.id, (previous) =>
                    previous.filter((message) => message.seq <= parent.seq),
                );
                await actions.deleteMessagesAfter(current.id, parent.seq);
                outcome = await runAssistant(
                    history,
                    runModel,
                    parent.seq + 1,
                    controller,
                );
            } catch (error) {
                outcome = "error";
                toastRunFailure(current.id, error);
            } finally {
                endChatRun(current.id, outcome, current.title);
            }
        },
        [actions, model, runAssistant],
    );

    /**
     * Edit a sent user message and rerun from it. assistant-ui hands us an
     * AppendMessage whose `parentId` is the edited message's parent; the
     * edited message is the first user message after that point. Images and
     * attachments on the original message are kept (only text is editable).
     */
    const editUserMessage = useCallback(
        async (message: AppendMessage) => {
            const current = conversationRef.current;
            if (
                isChatRunActive(current.id) ||
                hasPendingUserInput(current.id)
            ) {
                return;
            }
            if (!model) return;
            const list = messagesRef.current;
            const parentSeq = message.parentId
                ? (list.find((row) => row.id === message.parentId)?.seq ?? 0)
                : 0;
            const target = list.find(
                (row) => row.seq > parentSeq && row.role === "user",
            );
            if (!target) return;

            const textParts = appendMessageParts(message);
            const keptParts = target.parts.filter(
                (part) => part.type === "image" || part.type === "attachment",
            );
            const parts: ChatPart[] = [...textParts, ...keptParts];
            if (parts.length === 0) return;
            const content = messageText(parts);

            // The stored query wins over the optimistic list, so patch the
            // cache directly for an instant edit, then persist + rerun.
            const messagesKey = qk.chat.messages(user.id, current.id);
            queryClient.setQueryData<ChatMessage[]>(messagesKey, (previous) =>
                (previous ?? [])
                    .filter((row) => row.seq <= target.seq)
                    .map((row) =>
                        row.id === target.id ? { ...row, parts, content } : row,
                    ),
            );

            const controller = new AbortController();
            beginChatRun(current.id, controller, current.sandboxFiles);
            let outcome: ChatRunOutcome = "error";
            try {
                await actions
                    .updateMessage(target.id, current.id, {
                        parts,
                        content,
                        status: "complete",
                    })
                    .catch(() => {});
                await actions.deleteMessagesAfter(current.id, target.seq);
                const history = list
                    .filter((row) => row.seq < target.seq)
                    .concat({ ...target, parts, content });
                outcome = await runAssistant(
                    history,
                    model,
                    target.seq + 1,
                    controller,
                );
            } catch (error) {
                outcome = "error";
                toastRunFailure(current.id, error);
            } finally {
                endChatRun(current.id, outcome, current.title);
                void queryClient.invalidateQueries({ queryKey: messagesKey });
            }
        },
        [actions, model, queryClient, runAssistant, user.id],
    );

    /**
     * Continue a turn that a reload interrupted mid-question.
     *
     * A reload kills the in-memory tool loop, so an `ask_user` /
     * `log_expense` call that was waiting for an answer used to stay dead:
     * the question is persisted (its args live in the tool-call part) but
     * nothing showed the panel again. This re-asks through the pending
     * store, writes the answer into the part (guarded so a second tab
     * cannot double-answer), and re-enters the tool loop from that message.
     *
     * The run is claimed before waiting for the answer: a pending question
     * now survives navigation, and a remount must not start a second copy.
     */
    const resumeInterruptedTurn = useCallback(
        async (
            message: ChatMessage,
            call: ChatToolCallPart,
            request: UserInputRequest,
        ) => {
            const current = conversationRef.current;
            const modelInfo = model;
            if (!modelInfo || isChatRunActive(current.id)) return;

            const controller = new AbortController();
            beginChatRun(current.id, controller, current.sandboxFiles);
            let outcome: ChatRunOutcome = "error";
            try {
                const answer = await requestUserInput({
                    ...request,
                    conversationId: current.id,
                });
                if (
                    !answer.ok &&
                    (isTransientCancelReason(answer.error) ||
                        hasPendingUserInput())
                ) {
                    // Navigation, stop, or another conversation's question is
                    // already waiting: leave this one open for later instead
                    // of burning it with an error.
                    outcome = "stopped";
                    return;
                }

                // Double-answer guard: another tab may have answered already.
                const messagesKey = qk.chat.messages(user.id, current.id);
                const fresh = await actions.getMessage(message.id);
                const freshCall = fresh?.parts.find(
                    (part): part is ChatToolCallPart =>
                        part.type === "tool-call" &&
                        part.toolCallId === call.toolCallId,
                );
                if (!fresh || !freshCall || freshCall.result !== undefined) {
                    void queryClient.invalidateQueries({
                        queryKey: messagesKey,
                    });
                    outcome = "done";
                    return;
                }

                const args =
                    parseToolArgs(call.argsText) ??
                    ({} as Record<string, unknown>);
                const resolved = await resolveInteractiveToolResult(
                    call.toolName,
                    args,
                    answer,
                    {
                        createExpense: actions.createExpense,
                        onMemoryChanged: () => {
                            void queryClient.invalidateQueries({
                                queryKey: qk.chat.memories(user.id),
                            });
                        },
                    },
                );

                // Fill the answered call and mark sibling calls that never ran
                // (the loop executes sequentially, so a reload orphans them too).
                const updatedParts: ChatPart[] = fresh.parts.map((part) => {
                    if (
                        part.type !== "tool-call" ||
                        part.result !== undefined
                    ) {
                        return part;
                    }
                    if (part.toolCallId === call.toolCallId) {
                        return {
                            ...part,
                            result: resolved.result,
                            isError: resolved.isError,
                        };
                    }
                    return {
                        ...part,
                        result: { ok: false, error: "页面刷新中断了这次执行" },
                        isError: true,
                    };
                });

                queryClient.setQueryData<ChatMessage[]>(
                    messagesKey,
                    (previous) =>
                        (previous ?? []).map((row) =>
                            row.id === message.id
                                ? { ...row, parts: updatedParts }
                                : row,
                        ),
                );
                await actions
                    .updateMessage(message.id, current.id, {
                        parts: updatedParts,
                        content: fresh.content,
                        status: fresh.status,
                    })
                    .catch(() => {});

                if (resolved.isError || !isInteractiveTool(call.toolName)) {
                    outcome = resolved.isError ? "error" : "done";
                    return;
                }

                // Re-enter the tool loop: the model reads the answered result
                // and continues the same turn as a new assistant message.
                const history = messagesRef.current
                    .filter((row) => row.seq < message.seq)
                    .concat({ ...fresh, parts: updatedParts });
                outcome = await runAssistant(
                    history,
                    modelInfo,
                    message.seq + 1,
                    controller,
                );
            } catch (error) {
                outcome = "error";
                toastRunFailure(current.id, error);
            } finally {
                endChatRun(current.id, outcome, current.title);
                void queryClient.invalidateQueries({
                    queryKey: qk.chat.messages(user.id, current.id),
                });
            }
        },
        [actions, model, queryClient, runAssistant, user.id],
    );

    // Scan once per conversation: revive an unanswered question, or mark
    // orphaned sandbox calls as interrupted so they don't spin forever.
    // A run that is still alive in the store is skipped: its calls are not
    // orphaned, and resuming them would start a second run. While any
    // question is pending (even in another conversation) the global pending
    // slot is taken, so wait for it to clear and try again.
    const isRunning = run.running;
    const pendingInput = usePendingUserInput();
    useEffect(() => {
        if (isRunning || !model || pendingInput) return;
        if (scannedConversationRef.current === conversation.id) return;
        scannedConversationRef.current = conversation.id;

        const last = [...storedMessages]
            .reverse()
            .find((message) => message.role === "assistant");
        if (!last) return;
        const hasUnresolved = last.parts.some(
            (part) => part.type === "tool-call" && part.result === undefined,
        );
        if (!hasUnresolved) return;

        const interactive = last.parts.find(
            (part): part is ChatToolCallPart =>
                part.type === "tool-call" &&
                part.result === undefined &&
                pendingRequestFromToolCall(part.toolName, part.argsText) !==
                    null,
        );
        if (interactive) {
            const request = pendingRequestFromToolCall(
                interactive.toolName,
                interactive.argsText,
            );
            if (request) {
                void resumeInterruptedTurn(last, interactive, request);
                return;
            }
        }

        // No question to re-ask (sandbox calls never finished): persist an
        // interrupted marker instead. No auto-continuation — code must not
        // re-execute just because the page reloaded.
        void (async () => {
            const fresh = await actions.getMessage(last.id);
            if (!fresh) return;
            if (isChatRunActive(conversation.id)) return;
            if (
                !fresh.parts.some(
                    (part) =>
                        part.type === "tool-call" && part.result === undefined,
                )
            ) {
                return;
            }
            const marked = fresh.parts.map((part) =>
                part.type === "tool-call" && part.result === undefined
                    ? {
                          ...part,
                          result: {
                              ok: false,
                              error: "页面刷新中断了这次执行",
                          },
                          isError: true,
                      }
                    : part,
            );
            await actions
                .updateMessage(last.id, conversation.id, {
                    parts: marked,
                    content: fresh.content,
                    status: fresh.status,
                })
                .catch(() => {});
        })();
    }, [
        actions,
        conversation.id,
        isRunning,
        model,
        pendingInput,
        resumeInterruptedTurn,
        storedMessages,
    ]);

    const stop = useCallback(() => {
        stopChatRun(conversationRef.current.id);
    }, []);

    return {
        messages,
        live: run.live,
        running: run.running,
        send,
        stop,
        regenerate,
        editUserMessage,
        /** Sandbox files as of the latest tool run (for the header sheet). */
        sandboxFiles: run.sandboxFiles ?? conversation.sandboxFiles,
    };
}
