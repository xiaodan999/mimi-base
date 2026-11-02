import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import TouXiang from "@/components/TouXiang";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import compressImage from "@/lib/compressImage";
import { getUserAvatarUrl, getUserCircleUrl } from "@/lib/pb";
import { showFilesPicker } from "@/lib/showFilePicker";
import { toastPromise } from "@/lib/toast-promise";
import { cn } from "@/lib/utils";

import { useNewPostMutation, type PostLayout } from "../-data";

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
    const { user } = useAuth();
    const newPostMutation = useNewPostMutation();
    const [text, setText] = useState("");
    const [layout, setLayout] = useState<PostLayout>("moments");
    const [images, setImages] = useState<PreviewImage[]>([]);
    const [publishing, setPublishing] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const previewUrls = useRef<string[]>([]);

    // Release the local object URLs when the composer unmounts.
    useEffect(() => {
        const urls = previewUrls;
        return () => {
            urls.current.forEach((url) => URL.revokeObjectURL(url));
            urls.current = [];
        };
    }, []);

    const resetDraft = () => {
        previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
        previewUrls.current = [];
        setText("");
        setLayout("moments");
        setImages([]);
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

    return (
        <Drawer open={open} onOpenChange={onOpenChange} dismissible={false}>
            <DrawerContent className="kb-max-h overflow-hidden">
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex items-center justify-between px-4 pb-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onOpenChange(false)}
                        >
                            X
                        </Button>
                        <Button
                            size="sm"
                            className="px-6"
                            disabled={
                                (!text.trim() && images.length === 0) ||
                                publishing ||
                                preparing
                            }
                            onClick={publish}
                        >
                            {publishing && (
                                <LoadingSpinner
                                    className="absolute"
                                    size={16}
                                />
                            )}
                            <span className={cn({ invisible: publishing })}>
                                发布
                            </span>
                        </Button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                        <div className="flex gap-2">
                            <TouXiang
                                className="shrink-0"
                                circleUrl={getUserCircleUrl(user)}
                                touXiangUrl={getUserAvatarUrl(user)}
                                size={40}
                            />
                            <div className="min-w-0 flex-1">
                                <Textarea
                                    value={text}
                                    onChange={(event) =>
                                        setText(event.target.value)
                                    }
                                    className="min-h-[120px]"
                                    placeholder="记录一下"
                                />

                                {images.length > 0 && (
                                    <div className="mt-3 flex gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={
                                                layout === "moments"
                                                    ? "default"
                                                    : "outline"
                                            }
                                            onClick={() => setLayout("moments")}
                                        >
                                            朋友圈
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={
                                                layout === "instagram"
                                                    ? "default"
                                                    : "outline"
                                            }
                                            onClick={() =>
                                                setLayout("instagram")
                                            }
                                        >
                                            大图
                                        </Button>
                                    </div>
                                )}

                                <div className="mt-3 grid grid-cols-3 gap-2">
                                    {images.map((image, index) => (
                                        <div
                                            key={image.url}
                                            className="relative aspect-square overflow-hidden rounded-md bg-muted"
                                        >
                                            <img
                                                src={image.url}
                                                alt=""
                                                className="size-full object-cover"
                                            />
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    removeImage(index)
                                                }
                                                aria-label="移除图片"
                                                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                                            >
                                                <X className="size-3" />
                                            </button>
                                        </div>
                                    ))}
                                    {images.length < MAX_IMAGES && (
                                        <button
                                            type="button"
                                            onClick={pickImages}
                                            disabled={preparing}
                                            aria-label="添加图片"
                                            className="grid aspect-square place-items-center rounded-md border border-dashed border-input text-muted-foreground disabled:opacity-60"
                                        >
                                            {preparing ? (
                                                <LoadingSpinner size={20} />
                                            ) : (
                                                <Plus className="size-6" />
                                            )}
                                        </button>
                                    )}
                                </div>

                                {images.length > 0 && (
                                    <p className="mt-1 text-right text-xs text-muted-foreground">
                                        {images.length}/{MAX_IMAGES}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </DrawerContent>
        </Drawer>
    );
}
