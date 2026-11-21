import { useEffect, useRef } from "react";

import { EmptyState } from "@/components/EmptyState";
import { MediaGrid, MediaTile } from "@/components/MediaGrid";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Textarea } from "@/components/ui/textarea";
import { getFileUrl } from "@/lib/pb";
import { cn } from "@/lib/utils";

import {
    commentTextError,
    isCommentEdited,
    MAX_COMMENT_LENGTH,
} from "../comment-edit";
import { buildCommentThreads, type CommentData } from "../comments";
import { formatRelativeTime } from "../utils";
import AvatarPreview from "./avatar-preview";
import type { ViewerImage } from "./image-viewer";

/** A comment's images, thumbnailed behind the short-lived file token. */
function CommentImages({
    comment,
    compact = false,
    onOpen,
}: {
    comment: CommentData;
    compact?: boolean;
    onOpen: (images: ViewerImage[], index: number) => void;
}) {
    if (comment.images.length === 0) return null;

    const record = { id: comment.id, collectionId: comment.collectionId };
    const fullSize = comment.images.map((name) => ({
        name,
        url: getFileUrl(record, name),
    }));

    return (
        <MediaGrid
            className={cn(
                "mt-1.5 gap-1",
                comment.images.length === 1
                    ? "max-w-[13rem] grid-cols-1"
                    : compact
                      ? "max-w-[10rem] grid-cols-3"
                      : "grid-cols-3",
            )}
        >
            {comment.images.map((name, index) => (
                <MediaTile
                    key={name}
                    className="rounded-lg"
                    media={{
                        type: "image",
                        src: getFileUrl(record, name, "400x400"),
                    }}
                    onOpen={() => onOpen(fullSize, index)}
                    openLabel={`查看图片 ${index + 1}`}
                />
            ))}
        </MediaGrid>
    );
}

/**
 * Inline text editor for one of the user's own comments. Mounted only while
 * editing, so it takes focus once and dies when the edit is saved/cancelled.
 */
function InlineCommentEditor({
    value,
    hasImages,
    pending,
    onChange,
    onCancel,
    onSave,
}: {
    value: string;
    hasImages: boolean;
    pending: boolean;
    onChange: (value: string) => void;
    onCancel: () => void;
    onSave: () => void;
}) {
    const ref = useRef<HTMLTextAreaElement>(null);
    const error = commentTextError(value, hasImages ? 1 : 0);

    useEffect(() => {
        const input = ref.current;
        if (!input) return;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    }, []);

    return (
        <div className="mt-1 space-y-1.5">
            <Textarea
                ref={ref}
                value={value}
                rows={2}
                maxLength={MAX_COMMENT_LENGTH}
                aria-label="编辑评论内容"
                className="min-h-16 resize-none text-sm"
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Escape") {
                        event.preventDefault();
                        onCancel();
                    }
                }}
            />
            <div className="flex items-center justify-end gap-1.5">
                {error && (
                    <span className="mr-auto text-xs text-muted-foreground">
                        {error}
                    </span>
                )}
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={onCancel}
                >
                    取消
                </Button>
                <Button
                    type="button"
                    size="sm"
                    disabled={pending || !!error}
                    onClick={onSave}
                >
                    {pending ? "保存中..." : "保存"}
                </Button>
            </div>
        </div>
    );
}

type Props = {
    threads: ReturnType<typeof buildCommentThreads>;
    commentsById: Map<string, CommentData>;
    isPending: boolean;
    isError: boolean;
    editingId: string | null;
    editText: string;
    editPending: boolean;
    currentUserId: string;
    onRefetch: () => void;
    onChangeEditText: (value: string) => void;
    onCancelEdit: () => void;
    onSaveEdit: (comment: CommentData) => void;
    onStartReply: (comment: CommentData) => void;
    onStartEdit: (comment: CommentData) => void;
    onDelete: (comment: CommentData) => void;
    onOpenViewer: (images: ViewerImage[], index: number) => void;
};

/** Threaded comment list with load, error and empty states. */
export default function CommentList({
    threads,
    commentsById,
    isPending,
    isError,
    editingId,
    editText,
    editPending,
    currentUserId,
    onRefetch,
    onChangeEditText,
    onCancelEdit,
    onSaveEdit,
    onStartReply,
    onStartEdit,
    onDelete,
    onOpenViewer,
}: Props) {
    if (isPending) {
        return (
            <div className="flex justify-center py-10">
                <LoadingSpinner />
            </div>
        );
    }

    if (isError && threads.length === 0) {
        return (
            <div className="py-10 text-center">
                <p className="text-sm text-muted-foreground">评论加载失败</p>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={onRefetch}
                >
                    重试
                </Button>
            </div>
        );
    }

    if (threads.length === 0) {
        return (
            <EmptyState
                bare
                className="py-10"
                description="还没有评论，来说点什么吧"
                descriptionClassName="text-sm"
            />
        );
    }

    return (
        <ul className="divide-y">
            {threads.map(({ root, replies }) => {
                const rootLabel =
                    root.text || (root.images.length > 0 ? "图片评论" : "评论");

                return (
                    <li key={root.id} className="py-3">
                        <div className="flex gap-2">
                            <AvatarPreview size={32} user={root.author} />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-sm font-semibold">
                                        {root.author.user_name || "朋友"}
                                    </span>
                                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                                        <time dateTime={root.createdAt}>
                                            {formatRelativeTime(root.createdAt)}
                                        </time>
                                        {isCommentEdited(root) && (
                                            <span aria-label="已编辑">
                                                已编辑
                                            </span>
                                        )}
                                    </span>
                                </div>
                                {editingId === root.id ? (
                                    <InlineCommentEditor
                                        key={root.id}
                                        value={editText}
                                        hasImages={root.images.length > 0}
                                        pending={editPending}
                                        onChange={onChangeEditText}
                                        onCancel={onCancelEdit}
                                        onSave={() => onSaveEdit(root)}
                                    />
                                ) : (
                                    root.text && (
                                        <p className="text-sm break-words whitespace-pre-wrap">
                                            {root.text}
                                        </p>
                                    )
                                )}
                                <CommentImages
                                    comment={root}
                                    onOpen={onOpenViewer}
                                />
                                {editingId !== root.id && (
                                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                                        <button
                                            type="button"
                                            className="hover:text-foreground"
                                            aria-label={`回复 ${rootLabel}`}
                                            onClick={() => onStartReply(root)}
                                        >
                                            回复
                                        </button>
                                        {root.author.id === currentUserId && (
                                            <button
                                                type="button"
                                                className="hover:text-foreground"
                                                aria-label={`编辑 ${rootLabel}`}
                                                onClick={() =>
                                                    onStartEdit(root)
                                                }
                                            >
                                                编辑
                                            </button>
                                        )}
                                        {root.author.id === currentUserId && (
                                            <button
                                                type="button"
                                                className="hover:text-red-500"
                                                aria-label={`删除 ${rootLabel}`}
                                                onClick={() => onDelete(root)}
                                            >
                                                删除
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {replies.length > 0 && (
                            <ul className="mt-2 space-y-1.5 rounded-md bg-black/5 px-3 py-2">
                                {replies.map((reply) => {
                                    const replyLabel =
                                        reply.text ||
                                        (reply.images.length > 0
                                            ? "图片回复"
                                            : "回复");

                                    return (
                                        <li
                                            key={reply.id}
                                            className="text-sm leading-5"
                                        >
                                            {editingId === reply.id ? (
                                                <>
                                                    <p className="text-muted-foreground">
                                                        <span className="font-semibold text-foreground">
                                                            {reply.author
                                                                .user_name ||
                                                                "朋友"}
                                                        </span>
                                                        {" 回复 "}
                                                        <span className="font-semibold text-foreground">
                                                            {commentsById.get(
                                                                reply.parentId,
                                                            )?.author
                                                                .user_name ||
                                                                "该评论"}
                                                        </span>
                                                    </p>
                                                    <InlineCommentEditor
                                                        key={reply.id}
                                                        value={editText}
                                                        hasImages={
                                                            reply.images
                                                                .length > 0
                                                        }
                                                        pending={editPending}
                                                        onChange={
                                                            onChangeEditText
                                                        }
                                                        onCancel={onCancelEdit}
                                                        onSave={() =>
                                                            onSaveEdit(reply)
                                                        }
                                                    />
                                                </>
                                            ) : (
                                                <p className="break-words whitespace-pre-wrap">
                                                    <span className="font-semibold">
                                                        {reply.author
                                                            .user_name ||
                                                            "朋友"}
                                                    </span>
                                                    <span className="text-muted-foreground">
                                                        {" "}
                                                        回复{" "}
                                                    </span>
                                                    <span className="font-semibold">
                                                        {commentsById.get(
                                                            reply.parentId,
                                                        )?.author.user_name ||
                                                            "该评论"}
                                                    </span>
                                                    {reply.text && (
                                                        <span>
                                                            ：{reply.text}
                                                        </span>
                                                    )}
                                                </p>
                                            )}
                                            <CommentImages
                                                comment={reply}
                                                compact
                                                onOpen={onOpenViewer}
                                            />
                                            <div
                                                className={cn(
                                                    "mt-0.5 flex items-center gap-3 text-xs text-muted-foreground",
                                                    editingId === reply.id &&
                                                        "hidden",
                                                )}
                                            >
                                                <time
                                                    dateTime={reply.createdAt}
                                                >
                                                    {formatRelativeTime(
                                                        reply.createdAt,
                                                    )}
                                                </time>
                                                {isCommentEdited(reply) && (
                                                    <span aria-label="已编辑">
                                                        已编辑
                                                    </span>
                                                )}
                                                <button
                                                    type="button"
                                                    className="hover:text-foreground"
                                                    aria-label={`回复 ${replyLabel}`}
                                                    onClick={() =>
                                                        onStartReply(reply)
                                                    }
                                                >
                                                    回复
                                                </button>
                                                {reply.author.id ===
                                                    currentUserId && (
                                                    <button
                                                        type="button"
                                                        className="hover:text-foreground"
                                                        aria-label={`编辑 ${replyLabel}`}
                                                        onClick={() =>
                                                            onStartEdit(reply)
                                                        }
                                                    >
                                                        编辑
                                                    </button>
                                                )}
                                                {reply.author.id ===
                                                    currentUserId && (
                                                    <button
                                                        type="button"
                                                        className="hover:text-red-500"
                                                        aria-label={`删除 ${replyLabel}`}
                                                        onClick={() =>
                                                            onDelete(reply)
                                                        }
                                                    >
                                                        删除
                                                    </button>
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
