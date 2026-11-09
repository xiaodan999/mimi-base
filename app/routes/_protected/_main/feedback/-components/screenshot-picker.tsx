import { useEffect, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

import {
    MAX_FEEDBACK_SCREENSHOTS,
    MAX_SCREENSHOT_BYTES,
} from "@/app/feedback/validation";
import prepareImage from "@/lib/prepareImage";
import { showFilesPicker } from "@/lib/showFilePicker";

function Preview({
    file,
    onRemove,
    disabled,
}: {
    file: File;
    onRemove: () => void;
    disabled?: boolean;
}) {
    const [url, setUrl] = useState("");

    useEffect(() => {
        const next = URL.createObjectURL(file);
        setUrl(next);
        return () => URL.revokeObjectURL(next);
    }, [file]);

    return (
        <div className="relative aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted">
            {url ? (
                <img
                    alt={file.name}
                    className="h-full w-full object-cover"
                    src={url}
                />
            ) : null}
            <button
                type="button"
                aria-label={`移除截图 ${file.name}`}
                className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white transition-colors active:bg-black/80"
                disabled={disabled}
                onClick={onRemove}
            >
                <X className="size-3.5" aria-hidden="true" />
            </button>
        </div>
    );
}

export function ScreenshotPicker({
    files,
    onChange,
    disabled,
}: {
    files: File[];
    onChange: (files: File[]) => void;
    disabled?: boolean;
}) {
    const room = MAX_FEEDBACK_SCREENSHOTS - files.length;

    const choose = async () => {
        if (room <= 0) return;
        let picked: File[];
        try {
            picked = await showFilesPicker("image/*");
        } catch (error) {
            if (
                error instanceof Error &&
                /closed the file picker/i.test(error.message)
            ) {
                return;
            }
            toast.error("选择截图失败");
            return;
        }

        const accepted = picked.slice(0, room);
        if (picked.length > room) {
            toast.message(
                `最多 ${MAX_FEEDBACK_SCREENSHOTS} 张截图，多出的已忽略`,
            );
        }
        if (
            accepted.some(
                (file) =>
                    !file.type.startsWith("image/") ||
                    file.size > MAX_SCREENSHOT_BYTES,
            )
        ) {
            toast.error("只支持 5MB 以内的图片");
            return;
        }

        try {
            const prepared = await Promise.all(
                accepted.map((file, index) =>
                    prepareImage(file, files.length + index),
                ),
            );
            onChange([...files, ...prepared]);
        } catch {
            toast.error("截图压缩失败，换一张试试");
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium">截图</p>
                <span className="text-[11px] text-muted-foreground">
                    {files.length}/{MAX_FEEDBACK_SCREENSHOTS}
                </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
                {files.map((file, index) => (
                    <Preview
                        key={`${file.name}-${index}`}
                        disabled={disabled}
                        file={file}
                        onRemove={() =>
                            onChange(files.filter((_, item) => item !== index))
                        }
                    />
                ))}
                {room > 0 && (
                    <button
                        type="button"
                        className="grid aspect-square place-items-center rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground transition-colors active:bg-accent disabled:opacity-50"
                        disabled={disabled}
                        onClick={() => {
                            void choose();
                        }}
                    >
                        <span className="flex flex-col items-center gap-1 text-[11px]">
                            <ImagePlus className="size-5" aria-hidden="true" />
                            添加截图
                        </span>
                    </button>
                )}
            </div>
            <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                截图只保存在基地里，自动压缩后随反馈上传，不会直接发到 GitHub。
            </p>
        </div>
    );
}
