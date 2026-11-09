import { useEffect, useMemo, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

import ImageViewer from "@/app/feed/components/image-viewer";
import {
    attachmentSizeLabel,
    isImageAttachment,
} from "@/app/feedback/attachments";
import {
    MAX_ATTACHMENT_BYTES,
    MAX_FEEDBACK_ATTACHMENTS,
} from "@/app/feedback/validation";
import prepareImage from "@/lib/prepareImage";
import { showFilesPicker } from "@/lib/showFilePicker";

/** Keep the picked basename but adopt the compressed payload's extension. */
function renamePrepared(prepared: File, original: File): File {
    const extension = prepared.name.split(".").pop() || "webp";
    const stem = original.name.replace(/\.[^./\\]+$/, "").trim() || "image";
    return new File([prepared], `${stem}.${extension}`, {
        type: prepared.type,
    });
}

function ImagePreview({
    file,
    url,
    onOpen,
    onRemove,
    disabled,
}: {
    file: File;
    url: string;
    onOpen: () => void;
    onRemove: () => void;
    disabled?: boolean;
}) {
    return (
        <div className="relative aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted">
            <button
                type="button"
                aria-label={`查看附件 ${file.name}`}
                className="block h-full w-full"
                disabled={disabled}
                onClick={onOpen}
            >
                <img
                    alt={file.name}
                    className="h-full w-full object-cover"
                    src={url}
                />
            </button>
            <button
                type="button"
                aria-label={`移除附件 ${file.name}`}
                className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white transition-colors active:bg-black/80"
                disabled={disabled}
                onClick={onRemove}
            >
                <X className="size-3.5" aria-hidden="true" />
            </button>
        </div>
    );
}

function FileRow({
    file,
    onRemove,
    disabled,
}: {
    file: File;
    onRemove: () => void;
    disabled?: boolean;
}) {
    return (
        <li className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-2.5 py-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <FileText className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                    {file.name}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                    {attachmentSizeLabel(file.size)}
                </span>
            </span>
            <button
                type="button"
                aria-label={`移除附件 ${file.name}`}
                className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors active:bg-accent"
                disabled={disabled}
                onClick={onRemove}
            >
                <X className="size-4" aria-hidden="true" />
            </button>
        </li>
    );
}

/**
 * Feedback attachment picker (#54). Images are compressed with the shared
 * post pipeline; any other file goes up raw. Both kinds are uploaded straight
 * to GitHub when the form is submitted — PocketBase only stores their
 * metadata, and the repository being public makes every attachment public.
 */
export function AttachmentPicker({
    files,
    onChange,
    disabled,
    hint = `附件会直接上传到 GitHub Issue（公开可见），最多 ${MAX_FEEDBACK_ATTACHMENTS} 个，每个不超过 ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB；图片会自动压缩。`,
}: {
    files: File[];
    onChange: (files: File[]) => void;
    disabled?: boolean;
    hint?: string;
}) {
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const room = MAX_FEEDBACK_ATTACHMENTS - files.length;
    const images = files
        .map((file, index) => ({ file, index }))
        .filter(({ file }) => isImageAttachment(file));
    const others = files
        .map((file, index) => ({ file, index }))
        .filter(({ file }) => !isImageAttachment(file));
    const imageUrls = useMemo(
        () =>
            files
                .filter((file) => isImageAttachment(file))
                .map((file) => URL.createObjectURL(file)),
        [files],
    );

    // Object URLs are only valid until revoked; keep the current set alive
    // for the previews and the full-screen viewer, then release it on change.
    useEffect(() => {
        return () => {
            for (const url of imageUrls) URL.revokeObjectURL(url);
        };
    }, [imageUrls]);

    // Removing or adding files can invalidate the open viewer's index.
    useEffect(() => {
        setPreviewIndex(null);
    }, [files]);

    const removeAt = (index: number) => {
        onChange(files.filter((_, item) => item !== index));
    };

    const choose = async () => {
        if (room <= 0) return;
        let picked: File[];
        try {
            picked = await showFilesPicker("*/*");
        } catch (error) {
            if (
                error instanceof Error &&
                /closed the file picker/i.test(error.message)
            ) {
                return;
            }
            toast.error("选择附件失败");
            return;
        }

        const accepted = picked.slice(0, room);
        if (picked.length > room) {
            toast.message(
                `最多 ${MAX_FEEDBACK_ATTACHMENTS} 个附件，多出的已忽略`,
            );
        }
        if (accepted.some((file) => file.size > MAX_ATTACHMENT_BYTES)) {
            toast.error(
                `单个附件不能超过 ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB`,
            );
            return;
        }

        try {
            const prepared = await Promise.all(
                accepted.map(async (file, index) => {
                    if (!isImageAttachment(file)) return file;
                    const compressed = await prepareImage(
                        file,
                        files.length + index,
                    );
                    return renamePrepared(compressed, file);
                }),
            );
            if (prepared.some((file) => file.size > MAX_ATTACHMENT_BYTES)) {
                toast.error(
                    `单个附件不能超过 ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB`,
                );
                return;
            }
            onChange([...files, ...prepared]);
        } catch {
            toast.error("图片压缩失败，换一张试试");
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium">附件</p>
                <span className="text-[11px] text-muted-foreground">
                    {files.length}/{MAX_FEEDBACK_ATTACHMENTS}
                </span>
            </div>

            {images.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                    {images.map(({ file, index }, imageIndex) => (
                        <ImagePreview
                            key={`${file.name}-${index}`}
                            disabled={disabled}
                            file={file}
                            url={imageUrls[imageIndex] ?? ""}
                            onOpen={() => setPreviewIndex(imageIndex)}
                            onRemove={() => removeAt(index)}
                        />
                    ))}
                </div>
            )}
            {others.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                    {others.map(({ file, index }) => (
                        <FileRow
                            key={`${file.name}-${index}`}
                            disabled={disabled}
                            file={file}
                            onRemove={() => removeAt(index)}
                        />
                    ))}
                </ul>
            )}

            {room > 0 && (
                <button
                    type="button"
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/30 py-2.5 text-[11px] text-muted-foreground transition-colors active:bg-accent disabled:opacity-50"
                    disabled={disabled}
                    onClick={() => {
                        void choose();
                    }}
                >
                    <Paperclip className="size-4" aria-hidden="true" />
                    添加图片或文件
                </button>
            )}

            <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                {hint}
            </p>

            {previewIndex !== null && images[previewIndex] && (
                <ImageViewer
                    images={images.map(({ file }, index) => ({
                        name: file.name,
                        url: imageUrls[index] ?? "",
                    }))}
                    index={previewIndex}
                    open
                    onOpenChange={(next) => {
                        if (!next) setPreviewIndex(null);
                    }}
                />
            )}
        </div>
    );
}
