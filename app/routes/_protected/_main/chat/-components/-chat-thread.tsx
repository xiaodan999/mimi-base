import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActionBarPrimitive,
    AssistantRuntimeProvider,
    MessagePrimitive,
    ThreadPrimitive,
    type EmptyMessagePartProps,
    type ImageMessagePartProps,
} from "@assistant-ui/react";
import { ArrowDown, Copy, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { imagesToDataUrls } from "@/app/ai/image";
import type { ChatMessage, ChatModel, ChatPart } from "@/app/chat/types";
import { Button } from "@/components/ui/button";

import type { LiveReply } from "../-use-chat-session";
import { ChatComposer } from "./-chat-composer";
import { useChatRuntime } from "./-chat-runtime";
import {
    ChatImage,
    ErrorPart,
    MarkdownText,
    ReasoningPart,
    ToolCallPart,
} from "./-message-parts";

const MAX_IMAGES = 4;

function UserText({ text }: { text: string }) {
    return (
        <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
            {text}
        </div>
    );
}

function UserImage({ image, filename }: ImageMessagePartProps) {
    return <ChatImage image={image} filename={filename} />;
}

function AssistantEmpty({ status }: EmptyMessagePartProps) {
    if (status.type !== "running") return null;
    return (
        <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
            <span className="flex gap-1">
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current" />
            </span>
            正在思考…
        </div>
    );
}

function UserMessage() {
    return (
        <MessagePrimitive.Root className="mb-5 flex justify-end">
            <div className="max-w-[88%] rounded-3xl rounded-br-lg bg-primary px-4 py-2.5 text-primary-foreground shadow-sm">
                <MessagePrimitive.Parts
                    components={{ Text: UserText, Image: UserImage }}
                />
            </div>
        </MessagePrimitive.Root>
    );
}

function AssistantMessage() {
    return (
        <MessagePrimitive.Root className="group/message mb-5 flex gap-2">
            <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="size-3.5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
                <MessagePrimitive.Parts
                    components={{
                        Text: MarkdownText,
                        Reasoning: ReasoningPart,
                        Image: UserImage,
                        Empty: AssistantEmpty,
                        tools: { Override: ToolCallPart },
                        data: {
                            by_name: { error: ErrorPart },
                        },
                    }}
                />
                <ActionBarPrimitive.Root
                    hideWhenRunning
                    className="mt-1 flex items-center gap-0.5 opacity-70 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100"
                >
                    <ActionBarPrimitive.Copy asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="复制回复"
                            title="复制回复"
                            className="size-7 rounded-lg text-muted-foreground data-[copied=true]:text-primary"
                        >
                            <Copy className="size-3.5" />
                        </Button>
                    </ActionBarPrimitive.Copy>
                    <MessagePrimitive.If last>
                        <ActionBarPrimitive.Reload asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="重新生成"
                                title="重新生成"
                                className="size-7 rounded-lg text-muted-foreground"
                            >
                                <RotateCcw className="size-3.5" />
                            </Button>
                        </ActionBarPrimitive.Reload>
                    </MessagePrimitive.If>
                </ActionBarPrimitive.Root>
            </div>
        </MessagePrimitive.Root>
    );
}

function ThreadEmpty({ personaName }: { personaName: string }) {
    return (
        <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="size-6" />
            </div>
            <h2 className="mt-4 text-base font-semibold">{personaName}</h2>
            <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
                想聊什么都可以。可以让我算数、写代码、整理文字，或者单纯聊聊。
            </p>
        </div>
    );
}

export type ChatThreadProps = {
    messages: readonly ChatMessage[];
    live: LiveReply | null;
    running: boolean;
    model: ChatModel | undefined;
    personaName: string;
    onSend: (parts: ChatPart[]) => Promise<void>;
    onStop: () => void;
    onRegenerate: (parentId: string) => Promise<void>;
};

/**
 * The thread + composer. The composer keeps its own pending-image state;
 * images are appended to the message being sent and cleared right after, so
 * they never leak into the next message.
 */
export function ChatThread({
    messages,
    live,
    running,
    model,
    personaName,
    onSend,
    onStop,
    onRegenerate,
}: ChatThreadProps) {
    const [images, setImages] = useState<string[]>([]);
    const [addingImages, setAddingImages] = useState(false);
    const imagesRef = useRef<string[]>([]);
    imagesRef.current = images;

    const visionEnabled = model?.vision === true;
    const disabled = !model;

    // Switching to a text-only model must not leave images queued for a
    // request the relay would reject.
    useEffect(() => {
        if (visionEnabled) return;
        setImages((previous) => (previous.length > 0 ? [] : previous));
    }, [visionEnabled]);

    const sendWithImages = useCallback(
        async (parts: ChatPart[]) => {
            const pending = imagesRef.current;
            if (pending.length > 0) {
                imagesRef.current = [];
                setImages([]);
            }
            const withImages: ChatPart[] = [
                ...parts,
                ...pending.map((image) => ({ type: "image" as const, image })),
            ];
            await onSend(withImages);
        },
        [onSend],
    );

    const runtime = useChatRuntime({
        messages,
        live,
        running,
        onSend: sendWithImages,
        onStop,
        onRegenerate,
    });

    const handleAddImages = useCallback(
        async (files: FileList | null) => {
            if (!files || files.length === 0) return;
            if (!visionEnabled) {
                toast.error("当前模型不支持图片，换一个支持视觉的模型");
                return;
            }
            const room = MAX_IMAGES - imagesRef.current.length;
            if (room <= 0) {
                toast.error(`一条消息最多 ${MAX_IMAGES} 张图片`);
                return;
            }
            setAddingImages(true);
            try {
                const urls = await imagesToDataUrls(Array.from(files), {
                    limit: room,
                });
                if (urls.length === 0) {
                    toast.error("图片读取失败，换一张试试");
                    return;
                }
                setImages((previous) =>
                    [...previous, ...urls].slice(0, MAX_IMAGES),
                );
            } finally {
                setAddingImages(false);
            }
        },
        [visionEnabled],
    );

    const removeImage = useCallback((index: number) => {
        setImages((previous) =>
            previous.filter((_, current) => current !== index),
        );
    }, []);

    const empty = useMemo(
        () => messages.length === 0 && !live,
        [messages.length, live],
    );

    // Our own scroll-down affordance: assistant-ui's built-in button reports
    // "not at bottom" before the first scroll event and floats over the
    // composer on short threads.
    const viewportRef = useRef<HTMLDivElement>(null);
    const [showScrollDown, setShowScrollDown] = useState(false);
    const updateScroll = useCallback(() => {
        const element = viewportRef.current;
        if (!element) return;
        setShowScrollDown(
            element.scrollHeight - element.scrollTop - element.clientHeight >
                60,
        );
    }, []);
    useEffect(() => {
        updateScroll();
    }, [updateScroll, messages.length, live]);

    return (
        <AssistantRuntimeProvider runtime={runtime}>
            <div className="flex h-full min-h-0 flex-col">
                <ThreadPrimitive.Root className="relative flex min-h-0 flex-1 flex-col">
                    <ThreadPrimitive.Viewport
                        ref={viewportRef}
                        onScroll={updateScroll}
                        className="relative flex-1 overflow-y-auto overscroll-contain px-3 py-4"
                    >
                        {empty ? (
                            <ThreadEmpty personaName={personaName} />
                        ) : (
                            <ThreadPrimitive.Messages
                                components={{
                                    UserMessage,
                                    AssistantMessage,
                                }}
                            />
                        )}
                    </ThreadPrimitive.Viewport>
                    {showScrollDown && (
                        <button
                            type="button"
                            aria-label="滚动到最新消息"
                            onClick={() => {
                                const element = viewportRef.current;
                                if (!element) return;
                                element.scrollTo({
                                    top: element.scrollHeight,
                                    behavior: "smooth",
                                });
                            }}
                            className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-card p-2 text-muted-foreground shadow-lg active:bg-accent"
                        >
                            <ArrowDown className="size-4" />
                        </button>
                    )}
                </ThreadPrimitive.Root>

                <ChatComposer
                    images={images}
                    addingImages={addingImages}
                    visionEnabled={visionEnabled}
                    disabled={disabled}
                    running={running}
                    onAddImages={handleAddImages}
                    onRemoveImage={removeImage}
                    onStop={onStop}
                />
            </div>
        </AssistantRuntimeProvider>
    );
}
