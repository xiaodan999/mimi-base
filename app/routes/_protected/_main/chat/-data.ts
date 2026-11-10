import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { fetchChatModels } from "@/app/chat/api";
import { base64ToBytes, uploadFileName } from "@/app/chat/artifacts";
import { type AttachmentRecord } from "@/app/chat/attachments";
import {
    type ChatArtifactRecord,
    type ChatAttachmentRecord,
    type ChatConversationRecord,
    type ChatMemoryRecord,
    type ChatMessageRecord,
    type ChatPersonaRecord,
    toChatConversation,
    toChatMemory,
    toChatMessage,
    toChatPersona,
} from "@/app/chat/records";
import type {
    ChatArtifactPart,
    ChatConversation,
    ChatMemory,
    ChatMessage,
    ChatMessageStatus,
    ChatPart,
    ChatPersona,
    ChatUsage,
    SandboxFiles,
} from "@/app/chat/types";
import { useCurrentUser } from "@/lib/auth";
import { isPdfFileName } from "@/lib/chat-files";
import pb from "@/lib/pb";
import { qk } from "@/lib/query-keys";
import {
    MAX_ARTIFACT_BYTES,
    normalizeArtifactMime,
} from "@/lib/sandbox-protocol";

/* --------------------------------- reads -------------------------------- */

export function useChatModels() {
    return useQuery({
        queryKey: qk.chat.models(),
        queryFn: ({ signal }) => fetchChatModels(signal),
        staleTime: 5 * 60_000,
        retry: 1,
    });
}

export function useChatConversations() {
    const user = useCurrentUser();
    return useQuery({
        queryKey: qk.chat.conversations(user.id),
        queryFn: async () =>
            (
                await pb
                    .collection("chat_conversations")
                    .getFullList<ChatConversationRecord>({
                        filter: pb.filter("owner = {:owner}", {
                            owner: user.id,
                        }),
                        sort: "-updated",
                    })
            ).map(toChatConversation),
    });
}

export function useChatConversation(conversationId: string) {
    const user = useCurrentUser();
    return useQuery({
        queryKey: qk.chat.conversation(user.id, conversationId),
        enabled: conversationId !== "new",
        queryFn: async () =>
            toChatConversation(
                await pb
                    .collection("chat_conversations")
                    .getOne<ChatConversationRecord>(conversationId),
            ),
    });
}

export function useChatMessages(conversationId: string) {
    const user = useCurrentUser();
    return useQuery({
        queryKey: qk.chat.messages(user.id, conversationId),
        enabled: conversationId !== "new",
        queryFn: async () => {
            const rows = await pb
                .collection("chat_messages")
                .getFullList<ChatMessageRecord>({
                    filter: pb.filter(
                        "owner = {:owner} && conversation = {:conversation}",
                        { owner: user.id, conversation: conversationId },
                    ),
                    sort: "seq",
                });
            return rows.map(toChatMessage);
        },
    });
}

export function useChatPersonas() {
    const user = useCurrentUser();
    return useQuery({
        queryKey: qk.chat.personas(user.id),
        queryFn: async () =>
            (
                await pb
                    .collection("chat_personas")
                    .getFullList<ChatPersonaRecord>({
                        filter: pb.filter("owner = {:owner}", {
                            owner: user.id,
                        }),
                        sort: "-updated",
                    })
            ).map(toChatPersona),
    });
}

export type ChatMemoriesQueryOptions = {
    queryKey: readonly unknown[];
    queryFn: () => Promise<ChatMemory[]>;
};

/** Durable facts the model saved; injected into every run's system prompt. */
export function chatMemoriesQueryOptions(
    userId: string,
): ChatMemoriesQueryOptions {
    return {
        queryKey: qk.chat.memories(userId),
        queryFn: async () =>
            (
                await pb
                    .collection("chat_memories")
                    .getFullList<ChatMemoryRecord>({
                        filter: pb.filter("owner = {:owner}", {
                            owner: userId,
                        }),
                        sort: "-updated",
                    })
            ).map(toChatMemory),
    };
}

export function useChatMemories() {
    const user = useCurrentUser();
    return useQuery(chatMemoriesQueryOptions(user.id));
}

/* ------------------------------- mutations ------------------------------ */

export type CreateConversationInput = {
    title: string;
    model: string;
    thinking: string;
    persona: ChatPersona;
};

export type CreateMessageInput = {
    conversationId: string;
    role: "user" | "assistant";
    parts: ChatPart[];
    content: string;
    model: string;
    seq: number;
    status: ChatMessageStatus;
    error?: string;
    usage?: ChatUsage;
};

export type CreateArtifactInput = {
    conversationId: string;
    /** Assistant message the card lands on; cascades on delete/regenerate. */
    messageId?: string;
    /** Path the sandbox used, e.g. `chart.png`. */
    name: string;
    mime: string;
    size: number;
    /** Standard base64 from the sandbox response. */
    base64: string;
    caption?: string;
};

export type ConversationPatch = {
    title?: string;
    model?: string;
    thinking?: string;
    lastMessage?: string;
    sandboxFiles?: SandboxFiles;
    pinned?: boolean;
};

export type PersonaInput = {
    name: string;
    prompt: string;
    icon: string;
    description: string;
};

/**
 * Chat writes. Every mutation invalidates the whole `qk.chat.all` prefix so
 * the conversation list, the thread and the message cache stay consistent.
 */
export function useChatActions() {
    const user = useCurrentUser();
    const queryClient = useQueryClient();

    const invalidate = useCallback(
        () => queryClient.invalidateQueries({ queryKey: qk.chat.all }),
        [queryClient],
    );

    const nextSeq = useCallback(
        async (conversationId: string): Promise<number> => {
            const page = await pb
                .collection("chat_messages")
                .getList<ChatMessageRecord>(1, 1, {
                    filter: pb.filter(
                        "owner = {:owner} && conversation = {:conversation}",
                        { owner: user.id, conversation: conversationId },
                    ),
                    sort: "-seq",
                });
            const last = page.items[0]?.seq;
            return (typeof last === "number" ? last : 0) + 1;
        },
        [user.id],
    );

    const createConversation = useCallback(
        async (input: CreateConversationInput): Promise<ChatConversation> => {
            const record = await pb
                .collection("chat_conversations")
                .create<ChatConversationRecord>({
                    owner: user.id,
                    title: input.title.slice(0, 120) || "新对话",
                    model: input.model,
                    thinking: input.thinking.slice(0, 8),
                    persona_id: input.persona.id,
                    persona_name: input.persona.name,
                    persona_prompt: input.persona.prompt,
                    last_message: "",
                });
            await invalidate();
            return toChatConversation(record);
        },
        [invalidate, user.id],
    );

    const updateConversation = useCallback(
        async (conversationId: string, patch: ConversationPatch) => {
            const body: Record<string, unknown> = {};
            if (patch.title !== undefined) {
                body.title = patch.title.slice(0, 120) || "新对话";
            }
            if (patch.model !== undefined) body.model = patch.model;
            if (patch.thinking !== undefined) {
                body.thinking = patch.thinking.slice(0, 8);
            }
            if (patch.lastMessage !== undefined) {
                body.last_message = patch.lastMessage.slice(0, 200);
            }
            if (patch.sandboxFiles !== undefined) {
                body.sandbox_files =
                    Object.keys(patch.sandboxFiles).length > 0
                        ? patch.sandboxFiles
                        : null;
            }
            if (patch.pinned !== undefined) body.pinned = patch.pinned;
            if (Object.keys(body).length === 0) return;
            const record = await pb
                .collection("chat_conversations")
                .update<ChatConversationRecord>(conversationId, body);
            await invalidate();
            return toChatConversation(record);
        },
        [invalidate],
    );

    const deleteConversation = useCallback(
        async (conversationId: string) => {
            await pb.collection("chat_conversations").delete(conversationId);
            await invalidate();
        },
        [invalidate],
    );

    /**
     * Upload a binary artifact the sandbox just produced. The bytes only exist
     * in the run response (the container is gone afterwards), so this must
     * happen immediately. Text artifacts never come here — they stay in
     * `sandbox_files`.
     */
    const createArtifact = useCallback(
        async (input: CreateArtifactInput): Promise<ChatArtifactPart> => {
            const mime = normalizeArtifactMime(input.mime);
            if (!mime) throw new Error("这个文件类型不支持保存");
            const bytes = base64ToBytes(input.base64);
            if (bytes.length === 0) throw new Error("文件是空的");
            if (bytes.length > MAX_ARTIFACT_BYTES) {
                throw new Error("文件太大，保存不了");
            }
            const name = uploadFileName(input.name);
            const form = new FormData();
            form.append("owner", user.id);
            form.append("conversation", input.conversationId);
            if (input.messageId) form.append("message", input.messageId);
            form.append("name", name);
            form.append("mime", mime);
            form.append("size", String(bytes.length));
            if (input.caption)
                form.append("caption", input.caption.slice(0, 200));
            const blob = new Blob([bytes as unknown as BlobPart], {
                type: mime,
            });
            form.append("file", new File([blob], name, { type: mime }));
            const record = await pb
                .collection("chat_artifacts")
                .create<ChatArtifactRecord>(form);
            if (!record.file) throw new Error("文件没有保存成功");
            return {
                type: "artifact",
                source: "file",
                artifactId: record.id,
                collectionId: record.collectionId ?? "",
                file: record.file,
                name: record.name || name,
                mime,
                size: bytes.length,
                ...(record.caption ? { caption: record.caption } : {}),
            };
        },
        [user.id],
    );

    /**
     * Store a user-picked file (PDF, text, code) in `chat_attachments` before
     * the message exists — the relay reads this copy for extraction, and the
     * `read_attachment` tool re-reads it for follow-up questions. The
     * conversation link makes conversation deletion clean up unsent picks.
     */
    const createAttachment = useCallback(
        async (input: {
            conversationId: string;
            file: File;
        }): Promise<AttachmentRecord> => {
            const kind = isPdfFileName(input.file.name) ? "pdf" : "text";
            const mime =
                input.file.type ||
                (kind === "pdf" ? "application/pdf" : "text/plain");
            const name = uploadFileName(input.file.name);
            const form = new FormData();
            form.append("owner", user.id);
            form.append("conversation", input.conversationId);
            form.append("name", name);
            form.append("mime", mime.slice(0, 80));
            form.append("size", String(input.file.size));
            form.append("kind", kind);
            form.append("file", input.file, name);
            const record = await pb
                .collection("chat_attachments")
                .create<ChatAttachmentRecord>(form);
            if (!record.file) throw new Error("文件没有保存成功");
            return {
                id: record.id,
                collectionId: record.collectionId ?? "",
                file: record.file,
                name: record.name || name,
                mime,
                size: input.file.size,
                kind,
            };
        },
        [user.id],
    );

    /** Delete a pick that never became a message (chip removed pre-send). */
    const deleteAttachment = useCallback(async (id: string) => {
        await pb
            .collection("chat_attachments")
            .delete(id)
            .catch(() => {
                // Already gone (conversation deleted, second tab, ...) is fine.
            });
    }, []);

    /**
     * The write behind the chat's `log_expense` tool. Only called after the
     * user confirms the card; invalidating the ledger here keeps every caller
     * consistent (live loop and reload-resume alike).
     */
    const createExpense = useCallback(
        async (input: {
            item: string;
            price: number;
            category: string;
        }): Promise<{ id: string }> => {
            const record = await pb.collection("ji_zhang_biao").create({
                user_id: user.id,
                item_name: input.item,
                price: input.price,
                ...(input.category !== "" ? { category: input.category } : {}),
            });
            await queryClient.invalidateQueries({
                queryKey: qk.jiZhang.all,
            });
            return { id: record.id };
        },
        [queryClient, user.id],
    );

    /** Fresh read of one message — the double-answer guard for resume. */
    const getMessage = useCallback(
        async (messageId: string): Promise<ChatMessage | null> => {
            try {
                return toChatMessage(
                    await pb
                        .collection("chat_messages")
                        .getOne<ChatMessageRecord>(messageId),
                );
            } catch {
                return null;
            }
        },
        [],
    );

    const createMessage = useCallback(
        async (input: CreateMessageInput): Promise<ChatMessage> => {
            const record = await pb
                .collection("chat_messages")
                .create<ChatMessageRecord>({
                    owner: user.id,
                    conversation: input.conversationId,
                    role: input.role,
                    parts: input.parts,
                    content: input.content,
                    model: input.model,
                    seq: input.seq,
                    status: input.status,
                    ...(input.error
                        ? { error: input.error.slice(0, 300) }
                        : {}),
                    ...(input.usage ? { usage: input.usage } : {}),
                });
            const message = toChatMessage(record);
            // Write through to the query cache: a run that continues while the
            // thread is unmounted must leave the returning page with the same
            // rows the run already wrote, not a stale snapshot.
            queryClient.setQueryData<ChatMessage[]>(
                qk.chat.messages(user.id, input.conversationId),
                (previous) => {
                    if (!previous) return previous;
                    if (previous.some((row) => row.id === message.id)) {
                        return previous;
                    }
                    return [...previous, message].sort((a, b) => a.seq - b.seq);
                },
            );
            // Don't await the refetch: the caller swaps the live draft for
            // the optimistic row immediately, and waiting here let a refetch
            // render both copies for a frame (a visible jump on mobile).
            void queryClient.invalidateQueries({
                queryKey: qk.chat.messages(user.id, input.conversationId),
            });
            return message;
        },
        [queryClient, user.id],
    );

    const updateMessage = useCallback(
        async (
            messageId: string,
            conversationId: string,
            patch: {
                parts: ChatPart[];
                content: string;
                status: ChatMessageStatus;
                error?: string;
                usage?: ChatUsage;
            },
        ) => {
            const record = await pb
                .collection("chat_messages")
                .update<ChatMessageRecord>(messageId, {
                    parts: patch.parts,
                    content: patch.content,
                    status: patch.status,
                    ...(patch.error
                        ? { error: patch.error.slice(0, 300) }
                        : {}),
                    ...(patch.usage ? { usage: patch.usage } : {}),
                });
            const message = toChatMessage(record);
            queryClient.setQueryData<ChatMessage[]>(
                qk.chat.messages(user.id, conversationId),
                (previous) =>
                    previous
                        ? previous.map((row) =>
                              row.id === messageId ? message : row,
                          )
                        : previous,
            );
            await queryClient.invalidateQueries({
                queryKey: qk.chat.messages(user.id, conversationId),
            });
        },
        [queryClient, user.id],
    );

    /** Remove every message after `seq` (regenerate drops the old reply). */
    const deleteMessagesAfter = useCallback(
        async (conversationId: string, seq: number) => {
            const rows = await pb
                .collection("chat_messages")
                .getFullList<ChatMessageRecord>({
                    filter: pb.filter(
                        "owner = {:owner} && conversation = {:conversation} && seq > {:seq}",
                        {
                            owner: user.id,
                            conversation: conversationId,
                            seq,
                        },
                    ),
                });
            await Promise.all(
                rows.map((row) =>
                    pb.collection("chat_messages").delete(row.id),
                ),
            );
            queryClient.setQueryData<ChatMessage[]>(
                qk.chat.messages(user.id, conversationId),
                (previous) =>
                    previous
                        ? previous.filter((row) => row.seq <= seq)
                        : previous,
            );
            await queryClient.invalidateQueries({
                queryKey: qk.chat.messages(user.id, conversationId),
            });
        },
        [queryClient, user.id],
    );

    const createPersona = useCallback(
        async (input: PersonaInput): Promise<ChatPersona> => {
            const record = await pb
                .collection("chat_personas")
                .create<ChatPersonaRecord>({
                    owner: user.id,
                    name: input.name.slice(0, 40),
                    prompt: input.prompt,
                    icon: input.icon.slice(0, 16),
                    description: input.description.slice(0, 120),
                });
            await invalidate();
            return toChatPersona(record);
        },
        [invalidate, user.id],
    );

    const updatePersona = useCallback(
        async (id: string, input: PersonaInput) => {
            const record = await pb
                .collection("chat_personas")
                .update<ChatPersonaRecord>(id, {
                    name: input.name.slice(0, 40),
                    prompt: input.prompt,
                    icon: input.icon.slice(0, 16),
                    description: input.description.slice(0, 120),
                });
            await invalidate();
            return toChatPersona(record);
        },
        [invalidate],
    );

    const deletePersona = useCallback(
        async (id: string) => {
            await pb.collection("chat_personas").delete(id);
            await invalidate();
        },
        [invalidate],
    );

    return {
        nextSeq,
        createConversation,
        updateConversation,
        deleteConversation,
        getMessage,
        createMessage,
        createArtifact,
        createAttachment,
        deleteAttachment,
        createExpense,
        updateMessage,
        deleteMessagesAfter,
        createPersona,
        updatePersona,
        deletePersona,
    };
}
