import {
    type AppendMessage,
    AssistantRuntimeProvider,
    ThreadPrimitive,
} from "@assistant-ui/react";
import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { imagesToDataUrls } from "@/app/ai/image";
import {
    attachmentPartFromRecord,
    type AttachmentRecord,
    MAX_ATTACHMENTS,
    type PendingAttachment,
    readAttachmentFile,
    withFileRead,
} from "@/app/chat/attachments";
import { latestPromptTokens } from "@/app/chat/context";
import { useChatActions } from "@/app/chat/data";
import type { LiveReply } from "@/app/chat/session/use-chat-session";
import type {
    ChatMessage,
    ChatModel,
    ChatPart,
    SandboxFiles,
} from "@/app/chat/types";
import { usePendingUserInput } from "@/app/chat/user-input";
import { isPdfFileName, MAX_PAGE_IMAGES } from "@/lib/chat-files";

import { ArtifactPreviewProvider } from "./-artifact-viewer";
import { useChatRuntime } from "./-chat-runtime";
import RetryModelSheet from "./-retry-model-sheet";
import ThreadComposer from "./-thread-composer";
import {
    AssistantMessage,
    ThreadActionsContext,
    ThreadEmpty,
    UserMessage,
} from "./-thread-messages";
import { useThreadScroll } from "./-thread-scroll";
import { UserInputPanel } from "./-user-input-panel";

const MAX_IMAGES = 4;

/** Page images rendered from PDFs have their own per-message budget. */
function docImageCount(docs: readonly PendingAttachment[]): number {
    return docs.reduce((total, doc) => total + doc.part.pageImages.length, 0);
}

export type ChatThreadProps = {
    conversationId: string;
    messages: readonly ChatMessage[];
    live: LiveReply | null;
    running: boolean;
    /** Text artifacts resolve their preview from this snapshot. */
    sandboxFiles: SandboxFiles;
    model: ChatModel | undefined;
    models: readonly ChatModel[];
    personaName: string;
    /** Empty-thread quick prompts from the persona snapshot. */
    starters?: readonly string[];
    /** One-shot composer prefill (PWA share target). */
    initialDraft?: string;
    onSend: (parts: ChatPart[]) => Promise<void>;
    onStop: () => void;
    onRegenerate: (
        parentId: string,
        opts?: { model: ChatModel },
    ) => Promise<void>;
    onEdit: (message: AppendMessage) => Promise<void>;
    onFork: (messageId: string) => void;
};

/**
 * The thread + composer. The composer keeps its own pending-image state;
 * images and document attachments are appended to the message being sent and
 * cleared right after, so they never leak into the next message.
 */
export function ChatThread({
    conversationId,
    messages,
    live,
    running,
    sandboxFiles,
    model,
    models,
    personaName,
    starters,
    initialDraft,
    onSend,
    onStop,
    onRegenerate,
    onEdit,
    onFork,
}: ChatThreadProps) {
    const [images, setImages] = useState<string[]>([]);
    const [docs, setDocs] = useState<PendingAttachment[]>([]);
    const [addingImages, setAddingImages] = useState(false);
    const [retryTarget, setRetryTarget] = useState<string | null>(null);
    const imagesRef = useRef<string[]>([]);
    imagesRef.current = images;
    const docsRef = useRef<PendingAttachment[]>([]);
    docsRef.current = docs;

    const visionEnabled = model?.vision === true;
    const disabled = !model;
    const { createAttachment, deleteAttachment } = useChatActions();

    const threadActions = useMemo(
        () => ({ onFork, onRetryModel: setRetryTarget }),
        [onFork],
    );

    // Switching to a text-only model must not leave page images queued for a
    // request the relay would reject. The attachment itself stays — its
    // extracted text still reads fine without vision.
    useEffect(() => {
        if (visionEnabled) return;
        setImages((previous) => (previous.length > 0 ? [] : previous));
        setDocs((previous) =>
            previous.some((doc) => doc.part.pageImages.length > 0)
                ? previous.map((doc) =>
                      doc.part.pageImages.length > 0
                          ? { ...doc, part: { ...doc.part, pageImages: [] } }
                          : doc,
                  )
                : previous,
        );
    }, [visionEnabled]);

    const sendWithAttachments = useCallback(
        async (parts: ChatPart[]) => {
            const pendingImages = imagesRef.current;
            const pendingDocs = docsRef.current.filter((doc) => !doc.reading);
            if (pendingImages.length > 0) {
                imagesRef.current = [];
                setImages([]);
            }
            if (pendingDocs.length > 0) {
                docsRef.current = [];
                setDocs([]);
            }
            // Orphaned picks (still reading, or dropped by the filter) are
            // cleaned up by the conversation cascade; sending references the
            // stored record instead of inlining the extraction.
            const withAttachments: ChatPart[] = [
                ...parts,
                ...pendingDocs.map((doc) => doc.part),
                ...pendingImages.map((image) => ({
                    type: "image" as const,
                    image,
                })),
            ];
            await onSend(withAttachments);
        },
        [onSend],
    );

    const runtime = useChatRuntime({
        messages,
        live,
        running,
        onSend: sendWithAttachments,
        onStop,
        onRegenerate,
        onEdit,
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

    /**
     * Pick documents: each file is stored in `chat_attachments` first, then
     * read on this device (text decoded locally, PDF pages rasterized with
     * pdf.js). Failed reads drop the chip and the record.
     */
    const handleAddDocs = useCallback(
        async (files: FileList | null) => {
            if (!files || files.length === 0) return;
            const room = MAX_ATTACHMENTS - docsRef.current.length;
            if (room <= 0) {
                toast.error(`一条消息最多带 ${MAX_ATTACHMENTS} 个文件`);
                return;
            }
            setAddingImages(true);
            try {
                // Page images share one per-message budget across documents.
                let imageRoom =
                    MAX_PAGE_IMAGES - docImageCount(docsRef.current);
                for (const file of Array.from(files).slice(0, room)) {
                    let record: AttachmentRecord | null = null;
                    try {
                        if (isPdfFileName(file.name) && !visionEnabled) {
                            throw new Error("当前模型不支持图片，不能读取 PDF");
                        }
                        record = await createAttachment({
                            conversationId,
                            file,
                        });
                        const recordId = record.id;
                        const part = attachmentPartFromRecord(record);
                        setDocs((previous) =>
                            [...previous, { part, reading: true }].slice(
                                0,
                                MAX_ATTACHMENTS,
                            ),
                        );
                        const pageImageLimit = visionEnabled
                            ? Math.max(0, imageRoom)
                            : 0;
                        const read = await readAttachmentFile(file, {
                            pageImageLimit,
                        });
                        imageRoom -= read.pageImages.length;
                        setDocs((previous) =>
                            previous.map((doc) =>
                                doc.part.attachmentId === recordId
                                    ? {
                                          part: withFileRead(doc.part, read),
                                          reading: false,
                                      }
                                    : doc,
                            ),
                        );
                    } catch (error) {
                        const failedId = record?.id;
                        if (failedId) void deleteAttachment(failedId);
                        setDocs((previous) =>
                            previous.filter(
                                (doc) => doc.part.attachmentId !== failedId,
                            ),
                        );
                        toast.error(
                            error instanceof Error
                                ? error.message
                                : `${file.name} 读不出来`,
                        );
                    }
                }
            } finally {
                setAddingImages(false);
            }
        },
        [conversationId, createAttachment, deleteAttachment, visionEnabled],
    );

    const removeDoc = useCallback(
        (index: number) => {
            const doc = docsRef.current[index];
            if (doc) void deleteAttachment(doc.part.attachmentId);
            setDocs((previous) =>
                previous.filter((_, current) => current !== index),
            );
        },
        [deleteAttachment],
    );

    const addPickedImage = useCallback(
        (dataUrl: string) => {
            if (!visionEnabled) return;
            setImages((previous) =>
                [...previous, dataUrl].slice(0, MAX_IMAGES),
            );
        },
        [visionEnabled],
    );

    const empty = useMemo(
        () => messages.length === 0 && !live,
        [messages.length, live],
    );
    const contextUsed = useMemo(() => latestPromptTokens(messages), [messages]);
    const pendingInput = usePendingUserInput(conversationId);

    const { viewportRef, showScrollDown, updateScroll, scrollToBottom } =
        useThreadScroll({
            messagesLength: messages.length,
            live,
            pendingInput,
        });

    return (
        <ArtifactPreviewProvider files={sandboxFiles}>
            <AssistantRuntimeProvider runtime={runtime}>
                <ThreadActionsContext.Provider value={threadActions}>
                    <div className="flex h-full min-h-0 flex-col">
                        <ThreadPrimitive.Root className="relative flex min-h-0 flex-1 flex-col">
                            <ThreadPrimitive.Viewport
                                ref={viewportRef}
                                onScroll={updateScroll}
                                className="relative flex-1 overflow-y-auto overscroll-contain px-3 py-4"
                            >
                                {empty ? (
                                    <ThreadEmpty
                                        personaName={personaName}
                                        starters={starters}
                                        onSend={sendWithAttachments}
                                    />
                                ) : (
                                    <div className="mx-auto w-full max-w-3xl">
                                        <ThreadPrimitive.Messages
                                            components={{
                                                UserMessage,
                                                AssistantMessage,
                                            }}
                                        />
                                    </div>
                                )}
                            </ThreadPrimitive.Viewport>
                            {showScrollDown && (
                                <button
                                    type="button"
                                    aria-label="滚动到最新消息"
                                    onClick={scrollToBottom}
                                    className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-card p-2 text-muted-foreground shadow-lg active:bg-accent"
                                >
                                    <ArrowDown className="size-4" />
                                </button>
                            )}
                        </ThreadPrimitive.Root>

                        <UserInputPanel conversationId={conversationId} />

                        <ThreadComposer
                            images={images}
                            addingImages={addingImages}
                            docs={docs}
                            disabled={disabled}
                            inputPending={pendingInput !== null}
                            running={running}
                            contextUsed={contextUsed}
                            contextTotal={model?.contextWindow ?? 0}
                            visionEnabled={visionEnabled}
                            initialDraft={initialDraft ?? ""}
                            onRemoveImage={removeImage}
                            onRemoveDoc={removeDoc}
                            onSendAttachmentsOnly={() => {
                                void sendWithAttachments([]);
                            }}
                            onStop={onStop}
                            onAddImages={(files) => {
                                void handleAddImages(files);
                            }}
                            onAddDocs={(files) => {
                                void handleAddDocs(files);
                            }}
                            onPickedImage={addPickedImage}
                        />
                    </div>

                    <RetryModelSheet
                        target={retryTarget}
                        onOpenChange={(open) => {
                            if (!open) setRetryTarget(null);
                        }}
                        models={models}
                        currentModelId={model?.id}
                        running={running}
                        onRegenerate={(messageId, opts) => {
                            void onRegenerate(messageId, opts);
                        }}
                    />
                </ThreadActionsContext.Provider>
            </AssistantRuntimeProvider>
        </ArtifactPreviewProvider>
    );
}
