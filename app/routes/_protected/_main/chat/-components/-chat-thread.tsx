import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import {
    ActionBarPrimitive,
    AssistantRuntimeProvider,
    ComposerPrimitive,
    MessagePrimitive,
    ThreadPrimitive,
    useAui,
    useAuiState,
    type AppendMessage,
    type DataMessagePartProps,
    type EmptyMessagePartProps,
    type ImageMessagePartProps,
} from "@assistant-ui/react";
import {
    ArrowDown,
    Check,
    Copy,
    FileText,
    GitFork,
    MoreHorizontal,
    Pencil,
    Repeat2,
    RotateCcw,
    Sparkles,
    Volume2,
    VolumeX,
} from "lucide-react";
import { toast } from "sonner";

import { imagesToDataUrls } from "@/app/ai/image";
import { formatBytes } from "@/app/chat/artifacts";
import {
    attachmentPartFromRecord,
    extractAttachment,
    withExtracted,
    FILE_ACCEPT,
    MAX_ATTACHMENTS,
    type AttachmentRecord,
    type PendingAttachment,
} from "@/app/chat/attachments";
import { latestPromptTokens } from "@/app/chat/context";
import type {
    ChatAttachmentPart,
    ChatMessage,
    ChatModel,
    ChatPart,
    SandboxFiles,
} from "@/app/chat/types";
import { usePendingUserInput } from "@/app/chat/user-input";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { MAX_PAGE_IMAGES } from "@/lib/chat-files";
import { getFileUrl } from "@/lib/pb";
import { cn } from "@/lib/utils";

import { useChatActions } from "../-data";
import type { LiveReply } from "../-use-chat-session";
import { ArtifactPreviewProvider } from "./-artifact-viewer";
import { AttachmentSheet } from "./-attachment-sheet";
import { ChatComposer } from "./-chat-composer";
import { useChatRuntime } from "./-chat-runtime";
import {
    ArtifactPart,
    ChatImage,
    ErrorPart,
    MarkdownText,
    ReasoningPart,
    ToolCallPart,
} from "./-message-parts";
import { PostsImagePicker } from "./-posts-image-picker";
import { UserInputPanel } from "./-user-input-panel";

const MAX_IMAGES = 4;

/** Page images rendered from PDFs have their own per-message budget. */
function docImageCount(docs: readonly PendingAttachment[]): number {
    return docs.reduce((total, doc) => total + doc.part.pageImages.length, 0);
}

type ThreadActions = {
    onFork: (messageId: string) => void;
    onRetryModel: (messageId: string) => void;
};

/** Lets per-message action bars reach the route-level fork/retry handlers. */
const ThreadActionsContext = createContext<ThreadActions>({
    onFork: () => {},
    onRetryModel: () => {},
});

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

/**
 * File card for a stored attachment. Tapping opens the original file (the
 * protected URL gets a fresh short-lived token per render).
 */
function UserAttachmentCard({ data }: DataMessagePartProps) {
    const part = data as ChatAttachmentPart | undefined;
    if (!part || part.type !== "attachment") return null;
    const detail =
        part.kind === "pdf" && part.pageCount
            ? `PDF · ${part.pageCount} 页`
            : part.kind === "pdf"
              ? "PDF"
              : formatBytes(part.size);
    const url = getFileUrl(
        { id: part.attachmentId, collectionId: part.collectionId },
        part.file,
    );
    return (
        <a
            href={url || undefined}
            target="_blank"
            rel="noreferrer"
            className="mb-1.5 flex max-w-xs items-center gap-2 rounded-xl bg-primary-foreground/10 px-2.5 py-2 text-primary-foreground active:bg-primary-foreground/20"
        >
            <FileText className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium leading-tight">
                    {part.name}
                </span>
                <span className="block text-[11px] leading-tight opacity-70">
                    {detail}
                    {part.truncated ? " · 已截断" : ""}
                </span>
            </span>
        </a>
    );
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

/**
 * Per-message overflow menu. Branching off a message copies the whole
 * conversation and navigates away, so it must not sit next to the tiny
 * copy/edit icons where a thumb can hit it by accident.
 */
function MessageActionsMenu({ children }: { children: ReactNode }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="更多操作"
                    title="更多操作"
                    className="size-7 rounded-lg text-muted-foreground"
                >
                    <MoreHorizontal className="size-3.5" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
                {children}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function ForkMenuItem() {
    const { onFork } = useContext(ThreadActionsContext);
    const messageId = useAuiState((state) => state.message.id);
    return (
        <DropdownMenuItem onSelect={() => onFork(messageId)}>
            <GitFork className="size-3.5" />
            从这里分叉新对话
        </DropdownMenuItem>
    );
}

function CopyMenuItem({ label }: { label: string }) {
    const copied = useAuiState((state) => state.message.isCopied);
    return (
        <DropdownMenuItem asChild>
            <ActionBarPrimitive.Copy>
                {copied ? (
                    <Check className="size-3.5 text-primary" />
                ) : (
                    <Copy className="size-3.5" />
                )}
                {copied ? "已复制" : label}
            </ActionBarPrimitive.Copy>
        </DropdownMenuItem>
    );
}

/** One item that swaps between 朗读 and 停止朗读 for the current message. */
function SpeakMenuItem() {
    const speaking = useAuiState((state) => state.message.speech != null);
    if (speaking) {
        return (
            <DropdownMenuItem asChild>
                <ActionBarPrimitive.StopSpeaking>
                    <VolumeX className="size-3.5" />
                    停止朗读
                </ActionBarPrimitive.StopSpeaking>
            </DropdownMenuItem>
        );
    }
    return (
        <DropdownMenuItem asChild>
            <ActionBarPrimitive.Speak>
                <Volume2 className="size-3.5" />
                朗读回复
            </ActionBarPrimitive.Speak>
        </DropdownMenuItem>
    );
}

function UserMessage() {
    return (
        <MessagePrimitive.Root className="group/message mb-5 flex flex-col items-end">
            <ComposerPrimitive.If editing>
                <div className="w-[88%] rounded-3xl rounded-br-lg border border-primary/40 bg-card px-3 py-2 shadow-sm">
                    <ComposerPrimitive.Input asChild>
                        <textarea
                            rows={3}
                            autoFocus
                            aria-label="编辑这条消息"
                            className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none"
                        />
                    </ComposerPrimitive.Input>
                    <div className="mt-1 flex justify-end gap-1.5">
                        <ComposerPrimitive.Cancel asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 rounded-lg text-muted-foreground"
                            >
                                取消
                            </Button>
                        </ComposerPrimitive.Cancel>
                        <ComposerPrimitive.Send asChild>
                            <Button
                                type="button"
                                size="sm"
                                className="h-8 rounded-lg"
                            >
                                <Check className="mr-1 size-3.5" />
                                保存并重发
                            </Button>
                        </ComposerPrimitive.Send>
                    </div>
                </div>
            </ComposerPrimitive.If>
            <ComposerPrimitive.If editing={false}>
                <div className="max-w-[88%] rounded-3xl rounded-br-lg bg-primary px-4 py-2.5 text-primary-foreground shadow-sm">
                    <MessagePrimitive.Parts
                        components={{
                            Text: UserText,
                            Image: UserImage,
                            data: {
                                by_name: {
                                    attachment: UserAttachmentCard,
                                },
                            },
                        }}
                    />
                </div>
                <div className="mt-1 flex min-h-7 items-center gap-0.5 opacity-60 transition-opacity group-hover/message:opacity-100">
                    <ActionBarPrimitive.Root
                        hideWhenRunning
                        className="flex items-center gap-0.5"
                    >
                        <ActionBarPrimitive.Edit asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="编辑这条消息并重新回答"
                                title="编辑并重发"
                                className="size-7 rounded-lg text-muted-foreground"
                            >
                                <Pencil className="size-3.5" />
                            </Button>
                        </ActionBarPrimitive.Edit>
                    </ActionBarPrimitive.Root>
                    <MessageActionsMenu>
                        <CopyMenuItem label="复制这条消息" />
                        <ForkMenuItem />
                    </MessageActionsMenu>
                </div>
            </ComposerPrimitive.If>
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
                            by_name: {
                                artifact: ArtifactPart,
                                error: ErrorPart,
                            },
                        },
                    }}
                />
                {/* Reserve the bar's height: hiding it while streaming and
                    showing it on completion shifted the answer on mobile. */}
                <div className="mt-1 min-h-7">
                    <ActionBarPrimitive.Root
                        hideWhenRunning
                        className="flex items-center gap-0.5 opacity-70 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100"
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
                        <MessageActionsMenu>
                            <SpeakMenuItem />
                            <ForkMenuItem />
                            <MessagePrimitive.If last>
                                <RetryModelMenuItem />
                            </MessagePrimitive.If>
                        </MessageActionsMenu>
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
            </div>
        </MessagePrimitive.Root>
    );
}

/** Opens the 换模型重试 sheet for this reply. */
function RetryModelMenuItem() {
    const { onRetryModel } = useContext(ThreadActionsContext);
    const messageId = useAuiState((state) => state.message.id);
    return (
        <DropdownMenuItem onSelect={() => onRetryModel(messageId)}>
            <Repeat2 className="size-3.5" />
            换个模型重新生成
        </DropdownMenuItem>
    );
}

function ThreadEmpty({
    personaName,
    starters,
    onSend,
}: {
    personaName: string;
    starters?: readonly string[];
    onSend: (parts: ChatPart[]) => Promise<void>;
}) {
    return (
        <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="size-6" />
            </div>
            <h2 className="mt-4 text-base font-semibold">{personaName}</h2>
            <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
                想聊什么都可以。可以让我算数、写代码、整理文字，或者单纯聊聊。
            </p>
            {starters && starters.length > 0 && (
                <div className="mt-5 flex w-full max-w-xs flex-col gap-1.5">
                    {starters.map((starter) => (
                        <button
                            key={starter}
                            type="button"
                            onClick={() =>
                                void onSend([{ type: "text", text: starter }])
                            }
                            className="rounded-xl border border-border/70 bg-card px-3 py-2 text-left text-[13px] leading-snug text-foreground/90 shadow-sm active:bg-accent"
                        >
                            {starter}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
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

/** One-shot composer prefill for the share-target handoff. */
function ComposerSeed({ draft }: { draft: string }) {
    const aui = useAui();
    const seeded = useRef(false);
    useEffect(() => {
        if (seeded.current || draft === "") return;
        seeded.current = true;
        aui.composer.setText(draft);
        // Strip the state so going back/forward does not re-seed an old draft.
        window.history.replaceState({}, "");
    }, [aui, draft]);
    return null;
}

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
    const [attachOpen, setAttachOpen] = useState(false);
    const [postsOpen, setPostsOpen] = useState(false);
    const imagesRef = useRef<string[]>([]);
    imagesRef.current = images;
    const docsRef = useRef<PendingAttachment[]>([]);
    docsRef.current = docs;
    const docInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

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
     * the relay reads the stored copy (text extraction + page images for
     * vision models). Failed reads drop the chip and the record.
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
                        const extracted = await extractAttachment(recordId, {
                            pageImageLimit,
                        });
                        imageRoom -= extracted.pageImages?.length ?? 0;
                        setDocs((previous) =>
                            previous.map((doc) =>
                                doc.part.attachmentId === recordId
                                    ? {
                                          part: withExtracted(
                                              doc.part,
                                              extracted,
                                          ),
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

    // Closing the ask_user panel changes the viewport height; keep the
    // conversation anchored to the bottom so the follow-up answer is visible.
    const wasPending = useRef(false);
    useEffect(() => {
        if (wasPending.current && pendingInput === null) {
            requestAnimationFrame(() => {
                const element = viewportRef.current;
                if (!element) return;
                element.scrollTo({
                    top: element.scrollHeight,
                    behavior: "smooth",
                });
            });
        }
        wasPending.current = pendingInput !== null;
    }, [pendingInput]);

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
                                        onSend={onSend}
                                    />
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

                        <UserInputPanel conversationId={conversationId} />

                        <ChatComposer
                            images={images}
                            addingImages={addingImages}
                            docs={docs}
                            disabled={disabled}
                            inputPending={pendingInput !== null}
                            running={running}
                            contextUsage={{
                                used: contextUsed,
                                total: model?.contextWindow ?? 0,
                            }}
                            onOpenAttach={() => setAttachOpen(true)}
                            onRemoveImage={removeImage}
                            onRemoveDoc={removeDoc}
                            onStop={onStop}
                        />
                    </div>

                    <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                            void handleAddImages(event.target.files);
                            event.target.value = "";
                        }}
                    />
                    <input
                        ref={docInputRef}
                        type="file"
                        accept={FILE_ACCEPT}
                        multiple
                        className="hidden"
                        onChange={(event) => {
                            void handleAddDocs(event.target.files);
                            event.target.value = "";
                        }}
                    />
                    <AttachmentSheet
                        open={attachOpen}
                        onOpenChange={setAttachOpen}
                        visionEnabled={visionEnabled}
                        addingImages={addingImages}
                        onPickAlbum={() => imageInputRef.current?.click()}
                        onPickPosts={() => setPostsOpen(true)}
                        onPickFiles={() => docInputRef.current?.click()}
                    />
                    <PostsImagePicker
                        open={postsOpen}
                        onOpenChange={setPostsOpen}
                        onPicked={addPickedImage}
                    />
                    <ComposerSeed draft={initialDraft ?? ""} />

                    <Sheet
                        open={retryTarget !== null}
                        onOpenChange={(open) => {
                            if (!open) setRetryTarget(null);
                        }}
                    >
                        <SheetContent side="bottom" className="px-4 pb-6">
                            <SheetHeader className="pb-1 text-left">
                                <SheetTitle>换个模型重新生成</SheetTitle>
                            </SheetHeader>
                            <div className="space-y-1.5 pt-1">
                                {models.map((candidate) => (
                                    <button
                                        key={candidate.id}
                                        type="button"
                                        disabled={running}
                                        onClick={() => {
                                            const target = retryTarget;
                                            setRetryTarget(null);
                                            if (!target) return;
                                            void onRegenerate(target, {
                                                model: candidate,
                                            });
                                        }}
                                        className={cn(
                                            "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm active:bg-accent",
                                            candidate.id === model?.id
                                                ? "border-primary/40 bg-primary/5"
                                                : "border-border/70 bg-card",
                                        )}
                                    >
                                        <span className="font-medium">
                                            {candidate.label}
                                        </span>
                                        {candidate.id === model?.id && (
                                            <span className="text-[11px] text-primary">
                                                当前模型
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </SheetContent>
                    </Sheet>
                </ThreadActionsContext.Provider>
            </AssistantRuntimeProvider>
        </ArtifactPreviewProvider>
    );
}
