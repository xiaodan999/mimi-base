import { FileText, ImagePlus, Images, Info, Loader2 } from "lucide-react";

import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";

/**
 * Attachment sources for the composer paperclip. Album and posts need a
 * vision-capable model (they become image parts); documents work everywhere
 * because they are sent as text.
 */
export function AttachmentSheet({
    open,
    onOpenChange,
    visionEnabled,
    addingImages,
    onPickAlbum,
    onPickPosts,
    onPickFiles,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    visionEnabled: boolean;
    addingImages: boolean;
    onPickAlbum: () => void;
    onPickPosts: () => void;
    onPickFiles: () => void;
}) {
    const options = [
        {
            key: "album",
            icon: addingImages ? (
                <Loader2 className="size-4 animate-spin" />
            ) : (
                <ImagePlus className="size-4" />
            ),
            label: "相册",
            hint: visionEnabled
                ? "拍照或选图（压缩后发送）"
                : "当前模型不支持图片",
            enabled: visionEnabled && !addingImages,
            action: onPickAlbum,
        },
        {
            key: "posts",
            icon: <Images className="size-4" />,
            label: "从动态选择",
            hint: visionEnabled
                ? "选一张已发布的动态图片"
                : "当前模型不支持图片",
            enabled: visionEnabled,
            action: onPickPosts,
        },
        {
            key: "files",
            icon: <FileText className="size-4" />,
            label: "文件",
            hint: "文本、代码或 PDF；原文存在服务器，可反复细读",
            enabled: true,
            action: onPickFiles,
        },
    ];

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="px-4 pb-6">
                <SheetHeader className="pb-1 text-left">
                    <SheetTitle>添加附件</SheetTitle>
                </SheetHeader>
                <div className="space-y-1.5 pt-1">
                    {options.map((option) => (
                        <button
                            key={option.key}
                            type="button"
                            disabled={!option.enabled}
                            onClick={() => {
                                onOpenChange(false);
                                option.action();
                            }}
                            className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-left active:bg-accent disabled:opacity-50"
                        >
                            <span className="text-muted-foreground">
                                {option.icon}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium">
                                    {option.label}
                                </span>
                                <span className="block text-[11px] text-muted-foreground">
                                    {option.hint}
                                </span>
                            </span>
                        </button>
                    ))}
                </div>
                {!visionEnabled && (
                    <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        <Info className="mt-0.5 size-3 shrink-0" />
                        想发图片的话，把模型换成 DeepSeek V4.1 Flash 或 GLM-5.3
                        Flash。
                    </p>
                )}
            </SheetContent>
        </Sheet>
    );
}
