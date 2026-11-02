import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import TouXiang from "@/components/TouXiang";
import { Button } from "@/components/ui/button";
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
    onClose?: () => void;
    onSuccess?: () => void;
};

type PreviewImage = {
    file: File;
    url: string;
};

const MAX_IMAGES = 9;

export default function NewPost({
    onClose = () => {},
    onSuccess = () => {},
}: NewPostProps) {
    const { user } = useAuth();
    const newPostMutation = useNewPostMutation();
    const [text, setText] = useState("");
    const [layout, setLayout] = useState<PostLayout>("moments");
    const [images, setImages] = useState<PreviewImage[]>([]);
    const [publishing, setPublishing] = useState(false);
    const previewUrls = useRef<string[]>([]);

    // Release the local object URLs when the composer unmounts.
    useEffect(() => {
        const urls = previewUrls;
        return () => {
            urls.current.forEach((url) => URL.revokeObjectURL(url));
            urls.current = [];
        };
    }, []);

    const pickImages = async () => {
        const remaining = MAX_IMAGES - images.length;
        if (remaining <= 0) {
            toast.info(`最多只能选择 ${MAX_IMAGES} 张图片`);
            return;
        }

        try {
            const files = await showFilesPicker("image/*");
            if (files.length > remaining) {
                toast.info(`最多只能选择 ${MAX_IMAGES} 张图片`);
            }

            const next = files.slice(0, remaining).map((file) => {
                const url = URL.createObjectURL(file);
                previewUrls.current.push(url);
                return { file, url };
            });
            setImages((previous) => [...previous, ...next]);
        } catch {
            // The user cancelled the file picker.
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
        if ((!value && images.length === 0) || publishing) return;

        setPublishing(true);
        try {
            await toastPromise(
                (async () => {
                    const files: File[] = [];
                    for (const [index, image] of images.entries()) {
                        const compressed = await compressImage(image.file, {
                            quality: 0.7,
                            maxWidth: 1920,
                            maxHeight: 1920,
                        });
                        const type = compressed.type || "image/webp";
                        const ext = type.split("/")[1] || "webp";
                        files.push(
                            new File(
                                [compressed],
                                `${Date.now()}-${index}.${ext}`,
                                { type },
                            ),
                        );
                    }

                    return newPostMutation.mutateAsync({
                        text: value,
                        layout,
                        images: files,
                    });
                })(),
                {
                    loading:
                        images.length > 0 ? "处理图片并发布中..." : "发布中...",
                    success: "发布成功",
                    error: "发布失败",
                },
            );
            onSuccess();
        } catch {
            // toastPromise already surfaced the error.
        } finally {
            setPublishing(false);
        }
    };

    return (
        <div className="max-h-[80dvh] overflow-y-auto p-4">
            <div className="mb-4 flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={onClose}>
                    X
                </Button>
                <Button
                    size="sm"
                    className="px-6"
                    disabled={
                        (!text.trim() && images.length === 0) || publishing
                    }
                    onClick={publish}
                >
                    {publishing && (
                        <LoadingSpinner className="absolute" size={16} />
                    )}
                    <span className={cn({ invisible: publishing })}>发布</span>
                </Button>
            </div>

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
                        onChange={(event) => setText(event.target.value)}
                        className="min-h-[120px]"
                        placeholder="记录一下"
                    />

                    {images.length > 0 && (
                        <div className="mt-3 flex gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant={
                                    layout === "moments" ? "default" : "outline"
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
                                onClick={() => setLayout("instagram")}
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
                                    onClick={() => removeImage(index)}
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
                                aria-label="添加图片"
                                className="grid aspect-square place-items-center rounded-md border border-dashed border-input text-muted-foreground"
                            >
                                <Plus className="size-6" />
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
    );
}
