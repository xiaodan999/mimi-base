import {
    ActionBarPrimitive,
    ComposerPrimitive,
    type DataMessagePartProps,
    type EmptyMessagePartProps,
    type ImageMessagePartProps,
    MessagePrimitive,
    useAuiState,
} from "@assistant-ui/react";
import {
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
import { createContext, type ReactNode, useContext } from "react";

import { formatBytes } from "@/app/chat/artifacts";
import type { ChatAttachmentPart, ChatPart } from "@/app/chat/types";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getFileUrl } from "@/lib/pb";

import {
    ArtifactPart,
    ChatImage,
    ErrorPart,
    MarkdownText,
    ReasoningPart,
    ToolCallPart,
} from "./-message-parts";

type ThreadActions = {
    onFork: (messageId: string) => void;
    onRetryModel: (messageId: string) => void;
};

/** Lets per-message action bars reach the route-level fork/retry handlers. */
export const ThreadActionsContext = createContext<ThreadActions>({
    onFork: () => {},
    onRetryModel: () => {},
});

function UserText({ text }: { text: string }) {
    return (
        <div className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">
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
                <span className="block truncate text-[13px] leading-tight font-medium">
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

function UserMessage() {
    return (
        <MessagePrimitive.Root className="group/message mb-5 flex flex-col items-end">
            <ComposerPrimitive.If editing>
                <div className="w-[88%] rounded-3xl rounded-br-lg border border-primary/40 bg-card px-3 py-2 shadow-xs lg:w-[75%]">
                    <ComposerPrimitive.Input asChild submitMode="none">
                        <textarea
                            rows={3}
                            autoFocus
                            aria-label="编辑这条消息"
                            className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-hidden"
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
                <div className="max-w-[88%] rounded-3xl rounded-br-lg bg-primary px-4 py-2.5 text-primary-foreground shadow-xs lg:max-w-[75%]">
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
                        className="flex items-center gap-0.5 opacity-70 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100"
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

export function ThreadEmpty({
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
                            className="rounded-xl border border-border/70 bg-card px-3 py-2 text-left text-[13px] leading-snug text-foreground/90 shadow-xs active:bg-accent"
                        >
                            {starter}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export { AssistantMessage, UserMessage };
