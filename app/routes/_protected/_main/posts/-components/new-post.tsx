import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ImagePlus, Plus, X } from "lucide-react";
import { toast } from "sonner";

import TouXiang from "@/components/TouXiang";
import { Button } from "@/components/ui/button";
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerTitle,
} from "@/components/ui/drawer";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/lib/auth";
import compressImage from "@/lib/compressImage";
import { getUserAvatarUrl, getUserCircleUrl } from "@/lib/pb";
import { showFilesPicker } from "@/lib/showFilePicker";
import { toastPromise } from "@/lib/toast-promise";
import { cn } from "@/lib/utils";

import { useNewPostMutation, type PostLayout } from "../-data";
import ImageViewer from "./image-viewer";

type NewPostProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

type PreviewImage = {
    file: File;
    url: string;
};

const MAX_IMAGES = 9;

/**
 * Shrink a camera photo before it enters the composer, so the preview, the
 * in-memory copy and the upload are all the compressed version.
 */
async function prepareImage(file: File, index: number): Promise<File> {
    const compressed = await compressImage(file);
    const type = compressed.type || "image/jpeg";
    const ext = type.split("/")[1] || "jpg";
    return new File([compressed], `${Date.now()}-${index}.${ext}`, { type });
}

export default function NewPost({ open, onOpenChange }: NewPostProps) {
    const user = useCurrentUser();
    const newPostMutation = useNewPostMutation();
    const [text, setText] = useState("");
    const [layout, setLayout] = useState<PostLayout>("moments");
    const [images, setImages] = useState<PreviewImage[]>([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [publishing, setPublishing] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const previewUrls = useRef<string[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Release the local object URLs when the composer unmounts.
    useEffect(() => {
        const urls = previewUrls;
        return () => {
            urls.current.forEach((url) => URL.revokeObjectURL(url));
            urls.current = [];
        };
    }, []);

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

    const resetDraft = () => {
        previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
        previewUrls.current = [];
        setText("");
        setLayout("moments");
        setImages([]);
        setPendingCount(0);
        setPreviewIndex(null);
    };

    const handleOpenChange = (next: boolean) => {
        if (!next) setPreviewIndex(null);
        onOpenChange(next);
    };

    const pickImages = async () => {
        if (preparing) return;

        const remaining = MAX_IMAGES - images.length;
        if (remaining <= 0) {
            toast.info(`最多只能选择 ${MAX_IMAGES} 张图片`);
            return;
        }

        let picked: File[];
        try {
            picked = await showFilesPicker("image/*");
        } catch {
            // The user cancelled the file picker.
            return;
        }

        if (picked.length > remaining) {
            toast.info(`最多只能选择 ${MAX_IMAGES} 张图片`);
        }

        const selected = picked.slice(0, remaining);
        setPreparing(true);
        setPendingCount(selected.length);
        try {
            const results = await toastPromise(
                Promise.allSettled(selected.map(prepareImage)),
                {
                    loading: "压缩图片中...",
                    success: (settled) =>
                        settled.some((result) => result.status === "fulfilled")
                            ? "压缩完成"
                            : "没有可用的图片",
                    error: "图片压缩失败",
                },
            );

            const prepared = results.flatMap((result) =>
                result.status === "fulfilled" ? [result.value] : [],
            );
            if (prepared.length > 0 && prepared.length < selected.length) {
                toast.error(
                    `${selected.length - prepared.length} 张图片无法处理，已跳过`,
                );
            }

            const next = prepared.map((file) => {
                const url = URL.createObjectURL(file);
                previewUrls.current.push(url);
                return { file, url };
            });
            setImages((previous) => [...previous, ...next]);
        } catch {
            // toastPromise already surfaced the error.
        } finally {
            setPreparing(false);
            setPendingCount(0);
        }
    };

    const removeImage = (index: number) => {
        setImages((previous) => {
            const target = previous[index];
            if (target) {
                URL.revokeObjectURL(target.url);
                previewUrls.current = previewUrls.current.filter(
                    (url) => url !== target.url,
                );
            }
            return previous.filter((_, imageIndex) => imageIndex !== index);
        });
    };

    const publish = async () => {
        const value = text.trim();
        if ((!value && images.length === 0) || publishing || preparing) return;

        setPublishing(true);
        try {
            await toastPromise(
                newPostMutation.mutateAsync({
                    text: value,
                    layout,
                    images: images.map((image) => image.file),
                }),
                {
                    loading: "发布中...",
                    success: "发布成功",
                    error: "发布失败",
                },
            );
            resetDraft();
            onOpenChange(false);
        } catch {
            // toastPromise already surfaced the error.
        } finally {
            setPublishing(false);
        }
    };

    const canPublish =
        (text.trim().length > 0 || images.length > 0) &&
        !publishing &&
        !preparing;
    const showImages = images.length > 0 || preparing;

    return (
        <>
            <Drawer open={open} onOpenChange={handleOpenChange}>
                {/* On tablets/desktop the sheet floats as a centered card
                    instead of stretching edge to edge, and the drag handle is
                    hidden because the close button is the obvious affordance
                    with a mouse. `overflow-clip` (not `hidden`): hidden still
                    lets focus scrollIntoView scroll this container, which
                    pushes the header out of the sheet when the draft grows.
                    The primitive's handle is replaced by one inside the header
                    so the tint reaches the sheet's top edge. */}
                <DrawerContent className="kb-max-h mx-auto w-full max-w-2xl overflow-clip rounded-t-3xl border-x-0 border-b-0 border-t border-border/70 p-0 shadow-lift md:mb-5 md:rounded-3xl md:border md:[--kb-max-offset:28px] [&>div:first-child]:hidden">
                    {/* The tint fades straight down to fully transparent, so
                        it never draws a band or a bright pill against the
                        header divider. */}
                    <header className="relative shrink-0 overflow-hidden border-b border-border/60 bg-gradient-to-b from-primary/[0.08] to-primary/0 px-4 pb-4 pt-3 md:px-6">
                        <div
                            aria-hidden="true"
                            className="mx-auto mb-3 h-1.5 w-24 rounded-full bg-muted-foreground/30 md:hidden"
                        />
                        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-10 justify-self-start rounded-full border border-border/70 bg-background/70 text-foreground backdrop-blur"
                                onClick={() => handleOpenChange(false)}
                                aria-label="关闭"
                            >
                                <X className="size-4" />
                            </Button>

                            <div className="min-w-0 text-center">
                                <DrawerTitle className="flex items-center justify-center gap-2 text-[21px] font-semibold leading-tight tracking-tight">
                                    <span
                                        aria-hidden="true"
                                        className="size-2 shrink-0 rounded-full bg-primary"
                                    />
                                    新动态
                                </DrawerTitle>
                                <DrawerDescription className="mt-0.5 truncate text-xs text-muted-foreground">
                                    把这一刻留在秘密基地
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
                                ) : (
                                    <ArrowUp className="size-4" />
                                )}
                                <span>发布</span>
                            </Button>
                        </div>
                    </header>

                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] [scrollbar-color:hsl(var(--muted-foreground)/0.35)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5">
                        <div className="flex gap-3 pt-4">
                            <TouXiang
                                className="shrink-0"
                                circleUrl={getUserCircleUrl(user)}
                                touXiangUrl={getUserAvatarUrl(user)}
                                size={40}
                            />
                            <div className="min-w-0 flex-1">
                                <Textarea
                                    ref={textareaRef}
                                    value={text}
                                    onChange={(event) =>
                                        setText(event.target.value)
                                    }
                                    aria-label="动态内容"
                                    placeholder="今天发生了什么？"
                                    className="min-h-[132px] resize-none border-0 bg-transparent p-0 text-[17px] leading-7 shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0"
                                />
                            </div>
                        </div>

                        <section
                            className="mt-3 border-t border-border/60 pt-4"
                            aria-labelledby="new-post-media"
                        >
                            <div className="flex items-baseline justify-between">
                                <h3
                                    id="new-post-media"
                                    className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground"
                                >
                                    照片
                                </h3>
                                <span className="text-[11px] tabular-nums text-muted-foreground">
                                    {images.length > 0
                                        ? `${images.length}/${MAX_IMAGES}`
                                        : `最多 ${MAX_IMAGES} 张`}
                                </span>
                            </div>

                            {!showImages ? (
                                <button
                                    type="button"
                                    onClick={pickImages}
                                    className="mt-2.5 flex w-full items-center gap-3 rounded-2xl border border-dashed border-primary/35 bg-primary/[0.05] px-3.5 py-3.5 text-left transition-all duration-150 hover:bg-primary/[0.08] active:scale-[0.995]"
                                >
                                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                                        <ImagePlus className="size-5" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-semibold">
                                            添加照片
                                        </span>
                                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                            自动压缩，最多 9 张
                                        </span>
                                    </span>
                                    <Plus className="size-4 shrink-0 text-primary" />
                                </button>
                            ) : (
                                <div className="mt-2.5 grid grid-cols-3 gap-2">
                                    {images.map((image, index) => (
                                        <div
                                            key={image.url}
                                            className="relative aspect-square overflow-hidden rounded-2xl bg-muted"
                                        >
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setPreviewIndex(index)
                                                }
                                                aria-label={`预览第 ${index + 1} 张照片`}
                                                className="size-full"
                                            >
                                                <img
                                                    src={image.url}
                                                    alt=""
                                                    className="size-full object-cover"
                                                />
                                            </button>

                                            {layout === "instagram" &&
                                                index === 0 && (
                                                    <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                                                        封面
                                                    </span>
                                                )}

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    removeImage(index)
                                                }
                                                aria-label={`移除第 ${index + 1} 张照片`}
                                                className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75"
                                            >
                                                <X className="size-3.5" />
                                            </button>
                                        </div>
                                    ))}

                                    {preparing &&
                                        Array.from({
                                            length: pendingCount,
                                        }).map((_, index) => (
                                            <div
                                                key={`pending-${index}`}
                                                aria-hidden="true"
                                                className="grid aspect-square animate-pulse place-items-center rounded-2xl bg-muted"
                                            >
                                                <LoadingSpinner
                                                    size={16}
                                                    className="text-muted-foreground"
                                                />
                                            </div>
                                        ))}

                                    {images.length < MAX_IMAGES &&
                                        !preparing && (
                                            <button
                                                type="button"
                                                onClick={pickImages}
                                                aria-label="继续添加照片"
                                                className="grid aspect-square place-items-center rounded-2xl border border-dashed border-input bg-muted/40 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                                            >
                                                <Plus className="size-6" />
                                            </button>
                                        )}
                                </div>
                            )}
                        </section>

                        {images.length > 0 && (
                            <section
                                className="mt-5"
                                aria-labelledby="new-post-layout"
                            >
                                <h3
                                    id="new-post-layout"
                                    className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground"
                                >
                                    排版
                                </h3>
                                <div
                                    role="radiogroup"
                                    aria-labelledby="new-post-layout"
                                    className="mt-2.5 grid grid-cols-2 gap-2"
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
                                        const next: PostLayout =
                                            event.key === "Home"
                                                ? "moments"
                                                : event.key === "End"
                                                  ? "instagram"
                                                  : layout === "moments"
                                                    ? "instagram"
                                                    : "moments";
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
                                </div>
                            </section>
                        )}

                        <p className="mt-6 text-center text-[11px] text-muted-foreground/80">
                            关闭后会保留草稿
                        </p>
                    </div>
                </DrawerContent>
            </Drawer>

            {previewIndex !== null && (
                <ImageViewer
                    images={images.map((image) => ({
                        name: image.url,
                        url: image.url,
                    }))}
                    index={previewIndex}
                    open
                    onOpenChange={(next) => {
                        if (!next) setPreviewIndex(null);
                    }}
                />
            )}
        </>
    );
}

type LayoutOptionProps = {
    value: PostLayout;
    current: PostLayout;
    onSelect: (value: PostLayout) => void;
    title: string;
    caption: string;
    preview: "grid" | "wide";
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
                "flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-all duration-150",
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
                ) : (
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
                )}
            </span>

            <span className="min-w-0 flex-1">
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
                    "size-4 shrink-0 text-primary transition-opacity duration-150",
                    selected ? "opacity-100" : "opacity-0",
                )}
            />
        </button>
    );
}
