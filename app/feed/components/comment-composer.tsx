import { ImagePlus, SendHorizontal } from "lucide-react";
import type { RefObject } from "react";

import { MediaTile } from "@/components/MediaGrid";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { MAX_COMMENT_LENGTH } from "../comment-edit";
import type { CommentData } from "../comments";

export type CommentImageDraft = { file: File; url: string };

export const MAX_COMMENT_IMAGES = 4;

type Props = {
    text: string;
    replyingTo: CommentData | null;
    images: CommentImageDraft[];
    preparing: boolean;
    pending: boolean;
    inputRef: RefObject<HTMLTextAreaElement | null>;
    onTextChange: (value: string) => void;
    onCancelReply: () => void;
    onRemoveImage: (index: number) => void;
    onPickImages: () => void;
    onSubmit: () => void;
};

/** Reply banner, image drafts and the comment composer row. */
export default function CommentComposer({
    text,
    replyingTo,
    images,
    preparing,
    pending,
    inputRef,
    onTextChange,
    onCancelReply,
    onRemoveImage,
    onPickImages,
    onSubmit,
}: Props) {
    return (
        <div className="border-t p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {replyingTo && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-1.5 text-xs">
                    <span className="truncate">
                        回复{" "}
                        <span className="font-semibold">
                            @{replyingTo.author.user_name || "朋友"}
                        </span>
                    </span>
                    <button
                        type="button"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={onCancelReply}
                    >
                        取消
                    </button>
                </div>
            )}
            {images.length > 0 && (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    {images.map((image, index) => (
                        <MediaTile
                            key={image.url}
                            compact
                            className="size-14 shrink-0 rounded-lg"
                            media={{ type: "image", src: image.url }}
                            onRemove={() => onRemoveImage(index)}
                            removeLabel={`移除图片 ${index + 1}`}
                        />
                    ))}
                    <span className="text-xs text-muted-foreground">
                        {images.length}/{MAX_COMMENT_IMAGES}
                    </span>
                </div>
            )}
            <div className="flex items-end gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    aria-label="添加图片"
                    disabled={preparing || images.length >= MAX_COMMENT_IMAGES}
                    onClick={onPickImages}
                >
                    <ImagePlus className="size-4" aria-hidden="true" />
                </Button>
                <Textarea
                    ref={inputRef}
                    value={text}
                    onChange={(event) => onTextChange(event.target.value)}
                    placeholder={
                        replyingTo
                            ? `回复 ${replyingTo.author.user_name || "朋友"}...`
                            : "说点什么..."
                    }
                    rows={1}
                    maxLength={MAX_COMMENT_LENGTH}
                    className="max-h-24 min-h-10 resize-none"
                />
                <Button
                    type="button"
                    size="icon"
                    className="shrink-0"
                    onClick={onSubmit}
                    disabled={
                        (!text.trim() && images.length === 0) ||
                        pending ||
                        preparing
                    }
                    aria-label="发送评论"
                >
                    <SendHorizontal className="size-4" aria-hidden="true" />
                </Button>
            </div>
        </div>
    );
}
