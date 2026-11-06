import { useEffect } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft } from "lucide-react";

import type { ChatConversation } from "@/app/chat/types";
import LoadingPage from "@/components/LoadingPage";
import { Button } from "@/components/ui/button";

import { ChatHeader } from "./-components/-chat-header";
import { ChatThread } from "./-components/-chat-thread";
import {
    useChatActions,
    useChatConversation,
    useChatMessages,
    useChatModels,
} from "./-data";
import { useChatSession } from "./-use-chat-session";

export const Route = createFileRoute("/_protected/_main/chat/$conversationId")({
    component: ChatConversationPage,
});

function ChatConversationPage() {
    const { conversationId } = Route.useParams();
    const conversation = useChatConversation(conversationId);

    if (conversation.isLoading) return <LoadingPage />;

    if (conversation.isError || !conversation.data) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <AlertCircle className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                    这个对话不存在，可能已经被删除了。
                </p>
                <Button variant="outline" asChild>
                    <Link to="/chat">
                        <ArrowLeft className="mr-1 size-4" />
                        返回对话列表
                    </Link>
                </Button>
            </div>
        );
    }

    return (
        <ChatConversationView
            key={conversation.data.id}
            conversation={conversation.data}
        />
    );
}

function ChatConversationView({
    conversation,
}: {
    conversation: ChatConversation;
}) {
    const navigate = useNavigate();
    const actions = useChatActions();
    const modelsQuery = useChatModels();
    const messagesQuery = useChatMessages(conversation.id);

    const models = modelsQuery.data?.models ?? [];
    const fallbackId = modelsQuery.data?.defaultModel ?? "";
    const model =
        models.find((item) => item.id === conversation.model) ??
        models.find((item) => item.id === fallbackId) ??
        models[0];

    // Only send an effort the selected model advertises; a stored level can
    // become invalid when the conversation switches models.
    const thinking =
        model?.thinkingLevels.includes(conversation.thinking) === true
            ? conversation.thinking
            : "";

    // A model removed from the server allowlist should not brick the chat:
    // fall back to the default and remember that choice.
    useEffect(() => {
        if (!modelsQuery.isSuccess || !model) return;
        if (conversation.model === model.id) return;
        void actions.updateConversation(conversation.id, {
            model: model.id,
            thinking: thinking,
        });
    }, [
        actions,
        conversation.id,
        conversation.model,
        model,
        modelsQuery.isSuccess,
        thinking,
    ]);

    const session = useChatSession({
        conversation,
        storedMessages: messagesQuery.data ?? [],
        model,
    });

    return (
        <div className="flex h-full min-h-0 flex-col">
            <ChatHeader
                conversation={conversation}
                models={models}
                thinking={thinking}
                running={session.running}
                onChangeModel={(modelId) => {
                    const next = models.find((item) => item.id === modelId);
                    void actions.updateConversation(conversation.id, {
                        model: modelId,
                        thinking:
                            next?.thinkingLevels.includes(thinking) === true
                                ? thinking
                                : "",
                    });
                }}
                onChangeThinking={(level) => {
                    void actions.updateConversation(conversation.id, {
                        thinking: level,
                    });
                }}
                onRename={async (title) => {
                    await actions.updateConversation(conversation.id, {
                        title,
                    });
                }}
                onDelete={async () => {
                    await actions.deleteConversation(conversation.id);
                    await navigate({ to: "/chat", replace: true });
                }}
                onClearSandbox={async () => {
                    await actions.updateConversation(conversation.id, {
                        sandboxFiles: {},
                    });
                }}
            />
            <div className="min-h-0 flex-1">
                <ChatThread
                    messages={session.messages}
                    live={session.live}
                    running={session.running}
                    model={model}
                    personaName={conversation.personaName || "通用助手"}
                    onSend={session.send}
                    onStop={session.stop}
                    onRegenerate={session.regenerate}
                />
            </div>
        </div>
    );
}
