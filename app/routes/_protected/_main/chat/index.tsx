import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { stopChatRun } from "@/app/chat/run-store";
import type { ChatPersona } from "@/app/chat/types";

import { ConversationList } from "./-components/-conversation-list";
import { MemorySheet } from "./-components/-memory-sheet";
import { NewChatSheet } from "./-components/-new-chat-sheet";
import {
    useChatActions,
    useChatConversations,
    useChatMemories,
    useChatModels,
    useChatPersonas,
} from "./-data";

export const Route = createFileRoute("/_protected/_main/chat/")({
    component: ChatListPage,
});

function ChatListPage() {
    const navigate = useNavigate();
    const models = useChatModels();
    const conversations = useChatConversations();
    const personas = useChatPersonas();
    const actions = useChatActions();
    const [newOpen, setNewOpen] = useState(false);
    const [memoriesOpen, setMemoriesOpen] = useState(false);
    const memories = useChatMemories();

    const modelList = models.data?.models ?? [];

    const createConversation = async (input: {
        model: string;
        persona: ChatPersona;
        title: string;
    }) => {
        try {
            // Keep at most one empty conversation: a sheet that was opened
            // and abandoned should not litter the list.
            const stale = (conversations.data ?? []).filter(
                (conversation) => conversation.lastMessage === "",
            );
            await Promise.all(
                stale.map((conversation) =>
                    actions.deleteConversation(conversation.id).catch(() => {}),
                ),
            );
            const created = await actions.createConversation({
                ...input,
                thinking: "",
            });
            await navigate({
                to: "/chat/$conversationId",
                params: { conversationId: created.id },
                replace: true,
            });
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "创建对话失败",
            );
            throw error;
        }
    };

    return (
        <div className="min-h-full">
            <ConversationList
                conversations={conversations.data ?? []}
                personas={personas.data ?? []}
                loading={conversations.isLoading}
                onNewChat={() => setNewOpen(true)}
                onOpenMemories={() => setMemoriesOpen(true)}
                onRename={async (id, title) => {
                    await actions.updateConversation(id, { title });
                }}
                onDelete={async (id) => {
                    // A run may still be going in a conversation the user is
                    // not looking at; stop it before the row disappears.
                    stopChatRun(id);
                    await actions.deleteConversation(id);
                }}
                onTogglePin={async (id, pinned) => {
                    await actions.updateConversation(id, { pinned });
                }}
            />

            <MemorySheet
                open={memoriesOpen}
                onOpenChange={setMemoriesOpen}
                memories={memories.data ?? []}
                loading={memories.isLoading}
            />

            <NewChatSheet
                open={newOpen}
                onOpenChange={setNewOpen}
                models={modelList}
                defaultModel={models.data?.defaultModel ?? ""}
                personas={personas.data ?? []}
                onCreate={createConversation}
                onCreatePersona={(input) => actions.createPersona(input)}
                onUpdatePersona={(id, input) =>
                    actions.updatePersona(id, input)
                }
                onDeletePersona={async (id) => {
                    await actions.deletePersona(id);
                }}
            />
        </div>
    );
}
