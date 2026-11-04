import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Check, ImagePlus, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { useAi } from "@/app/ai/AiContext";
import AiSheet from "@/app/ai/AiSheet";
import { hashText, readAiCache, removeAiCache } from "@/app/ai/cache";
import {
    AiError,
    aiErrorText,
    chatJSON,
    isAiCanceled,
    throwIfAborted,
} from "@/app/ai/client";
import { imagesToDataUrls } from "@/app/ai/image";
import { captionMessages } from "@/app/ai/posts";
import { decideAiRestore } from "@/app/ai/restore";
import { useAiTasks } from "@/app/ai/tasks";
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
import { getUserAvatarUrl, getUserRing } from "@/lib/pb";
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

type CaptionOption = { style: string; text: string };

export default function NewPost({ open, onOpenChange }: NewPostProps) {
    const user = useCurrentUser();
    const newPostMutation = useNewPostMutation();
    const { settings, configured, openSettings } = useAi();
    const { runTask, cancel, attend, find, getResult } = useAiTasks();
    const [captionOpen, setCaptionOpen] = useState(false);
    const [captionLoading, setCaptionLoading] = useState(false);
    const [captionError, setCaptionError] = useState("");
    const [captions, setCaptions] = useState<CaptionOption[]>([]);
    const [text, setText] = useState("");
    const [layout, setLayout] = useState<PostLayout>("moments");
    const [images, setImages] = useState<PreviewImage[]>([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [publishing, setPublishing] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const previewUrls = useRef<string[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const captionKeyRef = useRef<string | null>(null);
    /** 当前 captions 属于哪份草稿，避免切换草稿后拿旧结果充数。 */
    const captionsKeyRef = useRef<string | null>(null);
    const restoredOpenRef = useRef(false);

    /** 同一份草稿（文字 + 排版 + 照片）对应同一个 AI 配文任务。 */
    const captionKey = useMemo(() => {
        const fingerprint = images
            .map(
                (image) =>
                    `${image.file.name}:${image.file.size}:${image.file.lastModified}`,
            )
            .join(",");
        return `captions:${hashText(
            `${text.trim()}|${layout}|${fingerprint}`,
        )}`;
    }, [text, layout, images]);

    // 配文面板开着时不用再弹完成通知
    useEffect(() => {
        if (!captionOpen) return;
        return attend("captions");
    }, [captionOpen, attend]);

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
        if (!next) {
            setPreviewIndex(null);
            // The caption sheet lives outside the drawer's portal; leaving it
            // open would strand a dead sheet over the feed.
            setCaptionOpen(false);
        }
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

    const suggestCaptions = async (
        options: { force?: boolean; restore?: boolean } = {},
    ) => {
        if (!configured) {
            openSettings();
            return;
        }

        const force = options.force === true;
        const restore = options.restore === true;
        const key = captionKey;

        if (captionKeyRef.current && captionKeyRef.current !== key) {
            cancel(captionKeyRef.current);
        }
        captionKeyRef.current = key;

        if (!force) {
            // 面板关掉后任务还在后台跑；重新打开草稿时先接回已有结果。
            const decision = decideAiRestore<CaptionOption[]>({
                task: find(key),
                local: captionsKeyRef.current === key ? captions : null,
                result: getResult<CaptionOption[]>(key),
                cached: readAiCache<CaptionOption[]>(key),
                hasValue: (list) => list.length > 0,
            });
            if (decision.kind === "ready") {
                captionsKeyRef.current = key;
                setCaptions(decision.value);
                setCaptionError("");
                setCaptionLoading(false);
                setCaptionOpen(true);
                return;
            }
            if (decision.kind === "error") {
                setCaptionOpen(true);
                setCaptionLoading(false);
                setCaptionError(decision.message);
                return;
            }
            if (decision.kind === "canceled") {
                setCaptionOpen(true);
                setCaptionLoading(false);
                setCaptionError("已取消");
                return;
            }
            if (decision.kind === "none" && restore) {
                // 没有可恢复的结果，别在打开草稿时偷偷发新请求。
                return;
            }
            // "running" 落到下面：接上同一个任务，显示加载态。
        }

        setCaptionOpen(true);
        setCaptionLoading(true);
        setCaptionError("");
        setCaptions([]);
        captionsKeyRef.current = null;
        if (force) removeAiCache(key);
        try {
            const list = await runTask<CaptionOption[]>({
                key,
                cacheKey: key,
                group: "captions",
                force,
                title: "AI 配文",
                subtitle: text.trim().slice(0, 30) || `${images.length} 张照片`,
                kind: "json",
                summarize: (value) => `生成了 ${value.length} 条文案`,
                run: async ({ signal }) => {
                    const imageUrls = await imagesToDataUrls(
                        images.map((image) => image.file),
                        { maxSize: 768, limit: 3 },
                    );
                    throwIfAborted(signal);

                    const result = await chatJSON<{
                        captions?: { style?: unknown; text?: unknown }[];
                    }>(
                        settings,
                        captionMessages({
                            imageUrls,
                            hint: text,
                            layout,
                            count: images.length,
                        }),
                        signal,
                    );

                    const value = (result.captions ?? []).flatMap((item) => {
                        if (typeof item.text !== "string") return [];
                        const textValue = item.text.trim().slice(0, 80);
                        if (!textValue) return [];
                        return [
                            {
                                style:
                                    typeof item.style === "string"
                                        ? item.style
                                        : "文案",
                                text: textValue,
                            },
                        ];
                    });

                    if (value.length === 0) {
                        throw new AiError("AI 没给出文案，再试一次？");
                    }
                    return value;
                },
            });
            captionsKeyRef.current = key;
            setCaptions(list);
        } catch (err) {
            if (!isAiCanceled(err)) setCaptionError(aiErrorText(err));
        } finally {
            setCaptionLoading(false);
        }
    };

    // 生成途中关掉草稿时 AI 面板也会关掉，任务继续在后台跑；
    // 回来时把已经生成（或还在生成）的配文重新摆出来。
    useEffect(() => {
        if (!open) {
            restoredOpenRef.current = false;
            return;
        }
        if (restoredOpenRef.current) return;
        restoredOpenRef.current = true;
        if (!configured) return;
        if (!find(captionKey)) return;
        void suggestCaptions({ restore: true });
        // 只在草稿重新打开时恢复一次，不跟输入内容联动。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, captionKey, configured]);

    const applyCaption = (caption: string) => {
        setText((previous) =>
            previous.trim() ? `${previous.trim()}\n${caption}` : caption,
        );
        setCaptionOpen(false);
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
                                {...getUserRing(user)}
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
                                <div className="mt-1 flex items-center justify-end">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 gap-1 rounded-full px-2 text-[11px] text-muted-foreground"
                                        onClick={() => void suggestCaptions()}
                                        disabled={captionLoading || preparing}
                                    >
                                        <Sparkles className="size-3.5" />
                                        AI 配文
                                    </Button>
                                </div>
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

            <AiSheet
                open={captionOpen}
                onClose={() => setCaptionOpen(false)}
                title="AI 配文"
                subtitle={
                    images.length > 0
                        ? `参考了 ${Math.min(images.length, 3)} 张照片`
                        : "参考你写的半句话"
                }
            >
                <div className="space-y-2 pb-2">
                    {captionLoading && (
                        <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-6 text-sm text-muted-foreground">
                            <LoadingSpinner size={16} />
                            AI 正在看照片...
                        </div>
                    )}

                    {captionError && (
                        <div className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-6 text-amber-800">
                            {captionError}
                            <button
                                type="button"
                                className="ml-1 font-semibold underline"
                                onClick={() =>
                                    void suggestCaptions({ force: true })
                                }
                            >
                                重试
                            </button>
                        </div>
                    )}

                    {captions.map((caption) => (
                        <button
                            key={`${caption.style}-${caption.text}`}
                            type="button"
                            onClick={() => applyCaption(caption.text)}
                            className="w-full rounded-2xl border border-border/60 bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.04]"
                        >
                            <span className="text-[11px] font-semibold text-primary">
                                {caption.style}
                            </span>
                            <span className="mt-1 block text-sm leading-6">
                                {caption.text}
                            </span>
                        </button>
                    ))}

                    {!captionLoading && (
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={() =>
                                void suggestCaptions({ force: true })
                            }
                        >
                            换一批
                        </Button>
                    )}

                    <p className="pt-1 text-center text-[10px] text-muted-foreground">
                        点一句填进输入框，还能继续改
                    </p>
                </div>
            </AiSheet>
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
