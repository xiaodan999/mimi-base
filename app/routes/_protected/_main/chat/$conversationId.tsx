import { useCallback, useEffect, useState } from "react";
import {
    Link,
    createFileRoute,
    useLocation,
    useNavigate,
} from "@tanstack/react-router";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { conversationToMarkdown, markdownFilename } from "@/app/chat/export";
import { findPersona, resolvePersona } from "@/app/chat/personas";
import { previewText } from "@/app/chat/records";
import { stopChatRun } from "@/app/chat/run-store";
import type { ChatConversation, ChatMessage } from "@/app/chat/types";
import LoadingPage from "@/components/LoadingPage";
import { Button } from "@/components/ui/button";
import { toastPromise } from "@/lib/toast-promise";

import { ChatHeader } from "./-components/-chat-header";
import { ChatThread } from "./-components/-chat-thread";
import { MemorySheet } from "./-components/-memory-sheet";
import {
    useChatActions,
    useChatConversation,
    useChatMemories,
    useChatMessages,
    useChatModels,
    useChatPersonas,
} from "./-data";
import { useChatSession } from "./-use-chat-session";

export const Route = createFileRoute("/_protected/_main/chat/$conversationId")({
    component: ChatConversationPage,
});

function ChatConversationPage() {
    const { conversationId } = Route.useParams();
    const conversation = useChatConversation(conversationId);
    const messages = useChatMessages(conversationId);

    // Wait for both queries before mounting the thread. Rendering it while the
    // message rows are still loading made `messages` look empty, so an old
    // conversation flashed the persona's starter screen (as if it were a
    // brand-new "新对话") for a frame before the history appeared.
    if (conversation.isLoading || messages.isLoading) return <LoadingPage />;

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
            storedMessages={messages.data ?? []}
        />
    );
}

function ChatConversationView({
    conversation,
    storedMessages,
}: {
    conversation: ChatConversation;
    storedMessages: readonly ChatMessage[];
}) {
    const navigate = useNavigate();
    const location = useLocation();
    const actions = useChatActions();
    const modelsQuery = useChatModels();
    const personasQuery = useChatPersonas();

    const [memoriesOpen, setMemoriesOpen] = useState(false);
    const memoriesQuery = useChatMemories();

    // One-shot composer prefill from the PWA share target (/share).
    const initialDraft =
        typeof location.state?.draft === "string"
            ? (location.state.draft as string)
            : undefined;

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
        storedMessages,
        model,
    });

    const personaStarters = resolvePersona(
        conversation.personaId,
        personasQuery.data ?? [],
    ).starters;

    /** Copy everything up to and including a message into a new conversation. */
    const handleFork = useCallback(
        async (messageId: string) => {
            const target = session.messages.find(
                (message) => message.id === messageId,
            );
            if (!target) return;
            const persona = findPersona(
                conversation.personaId,
                personasQuery.data ?? [],
            ) ?? {
                id: conversation.personaId,
                name: conversation.personaName || "通用助手",
                icon: "💬",
                description: "",
                prompt: conversation.personaPrompt,
                builtin: false,
            };
            const upto = session.messages.filter(
                (message) => message.seq <= target.seq,
            );
            const lastCopied = upto.at(-1);
            try {
                const created = await toastPromise(
                    (async () => {
                        const copy = await actions.createConversation({
                            title: `${conversation.title}（分支）`,
                            model: conversation.model,
                            thinking: conversation.thinking,
                            persona,
                        });
                        for (const message of upto) {
                            await actions.createMessage({
                                conversationId: copy.id,
                                role: message.role,
                                parts: message.parts,
                                content: message.content,
                                model: message.model,
                                seq: message.seq,
                                status: message.status,
                                ...(message.usage
                                    ? { usage: message.usage }
                                    : {}),
                            });
                        }
                        await actions.updateConversation(copy.id, {
                            lastMessage: previewText(lastCopied?.content ?? ""),
                            sandboxFiles: conversation.sandboxFiles,
                        });
                        return copy;
                    })(),
                    {
                        loading: "正在分叉…",
                        success: "已创建分支对话",
                        error: "分叉失败",
                    },
                );
                await navigate({
                    to: "/chat/$conversationId",
                    params: { conversationId: created.id },
                });
            } catch {
                // toast already shown
            }
        },
        [
            actions,
            conversation.model,
            conversation.personaId,
            conversation.personaName,
            conversation.personaPrompt,
            conversation.sandboxFiles,
            conversation.thinking,
            conversation.title,
            navigate,
            personasQuery.data,
            session.messages,
        ],
    );

    /** Share as a .md file when the platform allows it, else copy. */
    const handleExport = useCallback(() => {
        const markdown = conversationToMarkdown(conversation, session.messages);
        const filename = markdownFilename(conversation.title);
        const file = new File([markdown], filename, {
            type: "text/markdown",
        });
        if (
            typeof navigator.share === "function" &&
            navigator.canShare?.({ files: [file] })
        ) {
            void navigator
                .share({ files: [file], title: conversation.title })
                .catch(() => {});
            return;
        }
        void navigator.clipboard
            .writeText(markdown)
            .then(() => toast.success("已复制为 Markdown"))
            .catch(() => {
                const url = URL.createObjectURL(
                    new Blob([markdown], { type: "text/markdown" }),
                );
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = filename;
                anchor.click();
                URL.revokeObjectURL(url);
            });
    }, [conversation, session.messages]);

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
                    // Stop the background run before its conversation goes
                    // away; otherwise it keeps writing to a deleted row.
                    stopChatRun(conversation.id);
                    await actions.deleteConversation(conversation.id);
                    await navigate({ to: "/chat", replace: true });
                }}
                onClearSandbox={async () => {
                    await actions.updateConversation(conversation.id, {
                        sandboxFiles: {},
                    });
                }}
                onTogglePin={async () => {
                    await actions.updateConversation(conversation.id, {
                        pinned: !conversation.pinned,
                    });
                }}
                onExport={handleExport}
                onOpenMemories={() => setMemoriesOpen(true)}
            />
            <MemorySheet
                open={memoriesOpen}
                onOpenChange={setMemoriesOpen}
                memories={memoriesQuery.data ?? []}
                loading={memoriesQuery.isLoading}
            />
            <div className="min-h-0 flex-1">
                <ChatThread
                    conversationId={conversation.id}
                    messages={session.messages}
                    live={session.live}
                    running={session.running}
                    model={model}
                    models={models}
                    personaName={conversation.personaName || "通用助手"}
                    initialDraft={initialDraft}
                    starters={personaStarters}
                    onSend={session.send}
                    onStop={session.stop}
                    onRegenerate={session.regenerate}
                    onEdit={session.editUserMessage}
                    onFork={(messageId) => void handleFork(messageId)}
                />
            </div>
        </div>
    );
}
