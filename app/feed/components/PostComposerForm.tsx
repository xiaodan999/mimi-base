import { ArrowUp, Check, Sparkles, X } from "lucide-react";
import { useEffect, useRef } from "react";

import TouXiang from "@/components/TouXiang";
import { Button } from "@/components/ui/button";
import { DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/lib/auth";
import { getUserAvatarUrl, getUserRing } from "@/lib/pb";
import type { PostLayout } from "@/lib/pb-types";
import { cn } from "@/lib/utils";

import PostComposerImages from "./PostComposerImages";
import PostComposerVideo from "./PostComposerVideo";
import type { CaptionTask } from "./useCaptionTask";
import type { PostDraft } from "./usePostDraft";

type PostComposerFormProps = {
    draft: PostDraft;
    caption: CaptionTask;
    open: boolean;
    /** Close via the drawer handler so the caption sheet unwinds too. */
    onClose: () => void;
};

const LAYOUT_ORDER: PostLayout[] = ["moments", "instagram", "twitter"];

export default function PostComposerForm({
    draft,
    caption,
    open,
    onClose,
}: PostComposerFormProps) {
    const user = useCurrentUser();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const {
        isEditing,
        text,
        setText,
        layout,
        setLayout,
        images,
        video,
        publishing,
        preparing,
        pendingCount,
        canPublish,
        showImages,
        showVideo,
        setPreviewIndex,
        publish,
        pickImages,
        removeImage,
        moveImage,
        pickVideo,
        removeVideo,
    } = draft;

    // Grow the textarea with its content, up to a comfortable ceiling.
    useEffect(() => {
        const element = textareaRef.current;
        if (!element) return;
        element.style.height = "0px";
        element.style.height = `${Math.min(element.scrollHeight, 320)}px`;
    }, [text, open]);

    // Tapping "发布动态" means the user wants to type right away, but wait
    // for the sheet slide-in so the keyboard doesn't fight the animation.
    useEffect(() => {
        if (!open) return;
        const timer = window.setTimeout(() => {
            textareaRef.current?.focus({ preventScroll: true });
        }, 240);
        return () => window.clearTimeout(timer);
    }, [open]);

    return (
        <>
            {/* On tablets/desktop the sheet floats as a centered card instead
                of stretching edge to edge; the tint fades straight down so it
                never draws a band against the header divider. */}
            <header className="relative shrink-0 overflow-hidden border-b border-border/60 bg-linear-to-b from-primary/[0.08] to-primary/0 px-4 pt-3 pb-4 md:px-6">
                <div
                    aria-hidden="true"
                    className="mx-auto mb-3 h-1.5 w-24 rounded-full bg-muted-foreground/30 md:hidden"
                />
                <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-10 justify-self-start rounded-full border border-border/70 bg-background/70 text-foreground backdrop-blur-sm"
                        onClick={onClose}
                        aria-label="关闭"
                    >
                        <X className="size-4" />
                    </Button>

                    <div className="min-w-0 text-center">
                        <DrawerTitle className="flex items-center justify-center gap-2 text-[21px] leading-tight font-semibold tracking-tight">
                            <span
                                aria-hidden="true"
                                className="size-2 shrink-0 rounded-full bg-primary"
                            />
                            {isEditing ? "编辑动态" : "新动态"}
                        </DrawerTitle>
                        <DrawerDescription className="mt-0.5 truncate text-xs text-muted-foreground">
                            {isEditing
                                ? "改完记得保存"
                                : "把这一刻留在秘密基地"}
                        </DrawerDescription>
                    </div>

                    <Button
                        type="button"
                        size="sm"
                        className="h-10 gap-1.5 justify-self-end rounded-full px-5 shadow-[0_10px_24px_-12px_hsl(var(--primary)/0.8)]"
                        disabled={!canPublish}
                        aria-busy={publishing}
                        onClick={publish}
                    >
                        {publishing ? (
                            <LoadingSpinner size={14} />
                        ) : isEditing ? (
                            <Check className="size-4" />
                        ) : (
                            <ArrowUp className="size-4" />
                        )}
                        <span>{isEditing ? "保存" : "发布"}</span>
                    </Button>
                </div>
            </header>

            <div className="min-h-0 flex-1 [scrollbar-width:thin] [scrollbar-color:hsl(var(--muted-foreground)/0.35)_transparent] overflow-y-auto overscroll-contain px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-track]:bg-transparent">
                <div className="flex gap-3 pt-4">
                    <TouXiang
                        className="shrink-0"
                        {...getUserRing(user)}
                        touXiangUrl={getUserAvatarUrl(user)}
                        name={user.user_name}
                        size={40}
                    />
                    <div className="min-w-0 flex-1">
                        <Textarea
                            ref={textareaRef}
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                            aria-label="动态内容"
                            placeholder="今天发生了什么？"
                            className="min-h-[132px] resize-none border-0 bg-transparent p-0 text-[17px] leading-7 shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                        <div className="mt-1 flex items-center justify-end">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 rounded-full px-2 text-[11px] text-muted-foreground"
                                onClick={() => void caption.suggestCaptions()}
                                disabled={caption.captionLoading || preparing}
                            >
                                <Sparkles className="size-3.5" />
                                AI 配文
                            </Button>
                        </div>
                    </div>
                </div>

                {/* 照片和视频二选一：选了视频就不再显示照片入口，反之亦然。 */}
                {!showVideo && (
                    <PostComposerImages
                        images={images}
                        showImages={showImages}
                        preparing={preparing}
                        pendingCount={pendingCount}
                        layout={layout}
                        onPick={() => void pickImages()}
                        onRemove={removeImage}
                        onMove={moveImage}
                        onPreview={(index) => setPreviewIndex(index)}
                    />
                )}

                {!showImages && (
                    <PostComposerVideo
                        video={video}
                        preparing={preparing}
                        onPick={() => void pickVideo()}
                        onRemove={removeVideo}
                    />
                )}

                {(images.length > 0 || video !== null) && (
                    <section className="mt-5" aria-labelledby="new-post-layout">
                        <h3
                            id="new-post-layout"
                            className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground"
                        >
                            排版
                        </h3>
                        <div
                            role="radiogroup"
                            aria-labelledby="new-post-layout"
                            className="mt-2.5 grid grid-cols-3 gap-2"
                            onKeyDown={(event) => {
                                const keys = [
                                    "ArrowLeft",
                                    "ArrowRight",
                                    "ArrowUp",
                                    "ArrowDown",
                                    "Home",
                                    "End",
                                ];
                                if (!keys.includes(event.key)) return;

                                event.preventDefault();
                                const index = LAYOUT_ORDER.indexOf(layout);
                                const next =
                                    event.key === "Home"
                                        ? LAYOUT_ORDER[0]
                                        : event.key === "End"
                                          ? LAYOUT_ORDER[
                                                LAYOUT_ORDER.length - 1
                                            ]
                                          : event.key === "ArrowRight" ||
                                              event.key === "ArrowDown"
                                            ? LAYOUT_ORDER[
                                                  (index + 1) %
                                                      LAYOUT_ORDER.length
                                              ]
                                            : LAYOUT_ORDER[
                                                  (index -
                                                      1 +
                                                      LAYOUT_ORDER.length) %
                                                      LAYOUT_ORDER.length
                                              ];
                                setLayout(next);
                                event.currentTarget
                                    .querySelector<HTMLElement>(
                                        `[data-layout="${next}"]`,
                                    )
                                    ?.focus();
                            }}
                        >
                            <LayoutOption
                                value="moments"
                                current={layout}
                                onSelect={setLayout}
                                title="九宫格"
                                caption="朋友圈样式"
                                preview="grid"
                            />
                            <LayoutOption
                                value="instagram"
                                current={layout}
                                onSelect={setLayout}
                                title="大图"
                                caption="滑动浏览"
                                preview="wide"
                            />
                            <LayoutOption
                                value="twitter"
                                current={layout}
                                onSelect={setLayout}
                                title="推文"
                                caption="简洁时间线"
                                preview="tweet"
                            />
                        </div>
                    </section>
                )}

                <p className="mt-6 text-center text-[11px] text-muted-foreground/80">
                    {isEditing ? "关闭后不会保存本次修改" : "关闭后会保留草稿"}
                </p>
            </div>
        </>
    );
}

type LayoutOptionProps = {
    value: PostLayout;
    current: PostLayout;
    onSelect: (value: PostLayout) => void;
    title: string;
    caption: string;
    preview: "grid" | "wide" | "tweet";
};

/**
 * A radio card with a tiny diagram, so the feed layout is obvious without
 * having to publish first and see what happens.
 */
function LayoutOption({
    value,
    current,
    onSelect,
    title,
    caption,
    preview,
}: LayoutOptionProps) {
    const selected = value === current;

    return (
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            data-layout={value}
            onClick={() => onSelect(value)}
            className={cn(
                "relative flex flex-col items-start gap-2 rounded-2xl border p-2.5 text-left transition-all duration-150",
                selected
                    ? "border-primary/60 bg-primary/[0.07] shadow-soft"
                    : "border-border/70 bg-card/60 hover:border-primary/30",
            )}
        >
            <span
                aria-hidden="true"
                className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-lg",
                    selected ? "bg-primary/10" : "bg-muted",
                )}
            >
                {preview === "grid" ? (
                    <span className="grid grid-cols-3 gap-[3px]">
                        {Array.from({ length: 9 }).map((_, index) => (
                            <span
                                key={index}
                                className={cn(
                                    "size-1.5 rounded-[2px]",
                                    selected
                                        ? "bg-primary/70"
                                        : "bg-muted-foreground/40",
                                )}
                            />
                        ))}
                    </span>
                ) : preview === "wide" ? (
                    <span className="flex flex-col items-center gap-[3px]">
                        <span
                            className={cn(
                                "h-4 w-8 rounded-[3px]",
                                selected
                                    ? "bg-primary/70"
                                    : "bg-muted-foreground/40",
                            )}
                        />
                        <span className="flex gap-[3px]">
                            {Array.from({ length: 3 }).map((_, index) => (
                                <span
                                    key={index}
                                    className={cn(
                                        "size-1 rounded-full",
                                        selected
                                            ? "bg-primary/70"
                                            : "bg-muted-foreground/40",
                                    )}
                                />
                            ))}
                        </span>
                    </span>
                ) : (
                    <span className="flex w-7 flex-col gap-[3px]">
                        <span className="flex items-center gap-[3px]">
                            <span
                                className={cn(
                                    "size-1.5 rounded-full",
                                    selected
                                        ? "bg-primary/70"
                                        : "bg-muted-foreground/40",
                                )}
                            />
                            <span
                                className={cn(
                                    "h-1 w-4 rounded-[1px]",
                                    selected
                                        ? "bg-primary/70"
                                        : "bg-muted-foreground/40",
                                )}
                            />
                        </span>
                        <span
                            className={cn(
                                "h-1 w-7 rounded-[1px]",
                                selected
                                    ? "bg-primary/45"
                                    : "bg-muted-foreground/25",
                            )}
                        />
                        <span
                            className={cn(
                                "h-1 w-5 rounded-[1px]",
                                selected
                                    ? "bg-primary/45"
                                    : "bg-muted-foreground/25",
                            )}
                        />
                    </span>
                )}
            </span>

            <span className="w-full min-w-0">
                <span className="block truncate text-xs font-semibold">
                    {title}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                    {caption}
                </span>
            </span>

            <Check
                aria-hidden="true"
                className={cn(
                    "absolute top-2 right-2 size-3.5 text-primary transition-opacity duration-150",
                    selected ? "opacity-100" : "opacity-0",
                )}
            />
        </button>
    );
}
