import { ComposerPrimitive } from "@assistant-ui/react";
import { ArrowUp, FileText, Loader2, Paperclip, Square, X } from "lucide-react";

import type { PendingAttachment } from "@/app/chat/attachments";
import { contextPercent, formatTokenCount } from "@/app/chat/context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChatComposerProps = {
    images: readonly string[];
    addingImages: boolean;
    /** Stored document attachments waiting to be sent. */
    docs: readonly PendingAttachment[];
    disabled: boolean;
    /** An ask_user request is waiting; don't send another message. */
    inputPending: boolean;
    running: boolean;
    /** Latest prompt_tokens / the model's context window. */
    contextUsage?: { used: number; total: number };
    onOpenAttach: () => void;
    onRemoveImage: (index: number) => void;
    onRemoveDoc: (index: number) => void;
    onStop: () => void;
};

/**
 * Composer built on assistant-ui's composer primitives (Enter to send,
 * Shift+Enter for a newline, autosizing textarea). Dictation is intentionally
 * left to the phone keyboard — there is no in-app recorder.
 */
export function ChatComposer({
    images,
    addingImages,
    docs,
    disabled,
    inputPending,
    running,
    contextUsage,
    onOpenAttach,
    onRemoveImage,
    onRemoveDoc,
    onStop,
}: ChatComposerProps) {
    const percent =
        contextUsage && contextUsage.total > 0
            ? contextPercent(contextUsage.used, contextUsage.total)
            : null;

    return (
        <div className="border-t border-border/70 bg-background/95 px-3 pt-2 pb-2 backdrop-blur-xl">
            {docs.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                    {docs.map((doc, index) => (
                        <span
                            key={`${doc.part.name}-${index}`}
                            className="inline-flex max-w-full items-center gap-1 rounded-lg border border-border/70 bg-card px-2 py-1 text-[11px] text-muted-foreground"
                        >
                            <FileText className="size-3 shrink-0" />
                            <span className="min-w-0 truncate">
                                {doc.part.name}
                                {doc.reading
                                    ? "（读取中…）"
                                    : doc.part.pageImages.length > 0
                                      ? `（前 ${doc.part.pageImages.length} 页已转图片）`
                                      : doc.part.truncated
                                        ? "（已截断）"
                                        : ""}
                            </span>
                            <button
                                type="button"
                                aria-label={`移除附件 ${doc.part.name}`}
                                onClick={() => onRemoveDoc(index)}
                                className="ml-0.5 shrink-0 text-muted-foreground active:text-foreground"
                            >
                                <X className="size-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
            {docs.some((doc) => doc.part.pageImages.length > 0) && (
                <div className="mb-2 flex gap-2 overflow-x-auto pb-0.5">
                    {docs.flatMap((doc, docIndex) =>
                        doc.part.pageImages.map((image, index) => (
                            <img
                                key={`${doc.part.name}-${docIndex}-${index}`}
                                src={image}
                                alt={`${doc.part.name} 第 ${index + 1} 页`}
                                className="h-16 w-auto max-w-24 shrink-0 rounded-lg border border-border/70 object-cover"
                            />
                        )),
                    )}
                </div>
            )}
            {images.length > 0 && (
                <div className="mb-2 flex gap-2 overflow-x-auto pb-0.5">
                    {images.map((image, index) => (
                        <div
                            key={`${image.slice(0, 32)}-${index}`}
                            className="relative shrink-0"
                        >
                            <img
                                src={image}
                                alt={`待发送图片 ${index + 1}`}
                                className="size-16 rounded-xl border border-border/70 object-cover"
                            />
                            <button
                                type="button"
                                aria-label="移除图片"
                                onClick={() => onRemoveImage(index)}
                                className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background shadow-sm"
                            >
                                <X className="size-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <ComposerPrimitive.Root
                className={cn(
                    "flex items-end gap-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-soft transition-colors focus-within:border-primary/50",
                    disabled && "opacity-60",
                )}
            >
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="添加附件"
                    title="添加图片或文件"
                    disabled={disabled || running || inputPending}
                    onClick={onOpenAttach}
                    className="size-9 shrink-0 rounded-xl text-muted-foreground"
                >
                    {addingImages ? (
                        <Loader2 className="size-4 animate-spin" />
                    ) : (
                        <Paperclip className="size-4" />
                    )}
                </Button>

                <ComposerPrimitive.Input
                    placeholder={
                        inputPending
                            ? "请先回答 AI 的问题"
                            : disabled
                              ? "站点没有可用的聊天模型"
                              : "发消息…"
                    }
                    minRows={1}
                    maxRows={6}
                    disabled={disabled || inputPending}
                    className="min-h-9 flex-1 resize-none [scrollbar-width:none] bg-transparent px-1 py-2 text-[15px] leading-relaxed outline-hidden placeholder:text-muted-foreground [&::-webkit-scrollbar]:hidden"
                />

                {running ? (
                    <Button
                        type="button"
                        size="icon"
                        aria-label="停止生成"
                        title="停止生成"
                        onClick={onStop}
                        className="size-9 shrink-0 rounded-xl"
                    >
                        <Square className="size-3.5 fill-current" />
                    </Button>
                ) : (
                    <ComposerPrimitive.Send asChild>
                        <Button
                            type="submit"
                            size="icon"
                            aria-label="发送"
                            title="发送"
                            disabled={
                                disabled || inputPending ? true : undefined
                            }
                            className="size-9 shrink-0 rounded-xl disabled:opacity-40"
                        >
                            <ArrowUp className="size-4" />
                        </Button>
                    </ComposerPrimitive.Send>
                )}
            </ComposerPrimitive.Root>

            <div className="mt-1 flex items-center justify-between gap-2 px-1 text-[10px] text-muted-foreground/80">
                <span className="truncate">Enter 发送 · Shift+Enter 换行</span>
                {percent !== null && contextUsage && (
                    <span
                        className={cn(
                            "shrink-0 tabular-nums",
                            percent >= 95
                                ? "text-destructive"
                                : percent >= 80
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "",
                        )}
                        title={`上次请求约 ${formatTokenCount(
                            contextUsage.used,
                        )} / ${formatTokenCount(contextUsage.total)} tokens`}
                    >
                        上下文 {percent}%
                    </span>
                )}
            </div>
        </div>
    );
}
