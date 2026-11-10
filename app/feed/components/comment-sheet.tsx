import { ImagePlus, SendHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/lib/auth";
import { getFileUrl } from "@/lib/pb";
import prepareImage from "@/lib/prepareImage";
import { showFilesPicker } from "@/lib/showFilePicker";
import { toastPromise } from "@/lib/toast-promise";
import { cn } from "@/lib/utils";

import {
    commentTextError,
    isCommentEdited,
    MAX_COMMENT_LENGTH,
} from "../comment-edit";
import {
    buildCommentThreads,
    type CommentData,
    useComments,
    useDeleteCommentMutation,
    useEditCommentMutation,
    useNewCommentMutation,
} from "../comments";
import { formatRelativeTime } from "../utils";
import AvatarPreview from "./avatar-preview";
import ImageViewer, { type ViewerImage } from "./image-viewer";

type CommentSheetProps = {
    postId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

type CommentImageDraft = { file: File; url: string };

const MAX_COMMENT_IMAGES = 4;

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
        <div
            className={cn(
                "mt-1.5 grid gap-1",
                comment.images.length === 1
                    ? "max-w-[13rem] grid-cols-1"
                    : compact
                      ? "max-w-[10rem] grid-cols-3"
                      : "grid-cols-3",
            )}
        >
            {comment.images.map((name, index) => (
                <button
                    key={name}
                    type="button"
                    aria-label={`查看图片 ${index + 1}`}
                    className="overflow-hidden rounded-lg border border-border/60 bg-muted transition-opacity active:opacity-80"
                    onClick={() => onOpen(fullSize, index)}
                >
                    <img
                        alt=""
                        className="aspect-square w-full object-cover"
                        draggable={false}
                        loading="lazy"
                        src={getFileUrl(record, name, "400x400")}
                    />
                </button>
            ))}
        </div>
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
                    } else if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        if (!error) onSave();
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

export default function CommentSheet({
    postId,
    open,
    onOpenChange,
}: CommentSheetProps) {
    const user = useCurrentUser();
    const { data: comments = [], isPending } = useComments(
        postId ?? "",
        open && !!postId,
    );
    const newComment = useNewCommentMutation(postId ?? "");
    const editComment = useEditCommentMutation(postId ?? "");
    const deleteComment = useDeleteCommentMutation(postId ?? "");
    const [text, setText] = useState("");
    const [replyingTo, setReplyingTo] = useState<CommentData | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");
    const [images, setImages] = useState<CommentImageDraft[]>([]);
    const [preparing, setPreparing] = useState(false);
    const [viewer, setViewer] = useState<{
        images: ViewerImage[];
        index: number;
    } | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    // Object URLs for the drafts, revoked when the draft is sent or dropped.
    const previewUrls = useRef<string[]>([]);

    const threads = useMemo(() => buildCommentThreads(comments), [comments]);
    const commentsById = useMemo(
        () => new Map(comments.map((comment) => [comment.id, comment])),
        [comments],
    );

    useEffect(() => {
        // Clear only when switching posts; closing the sheet (or dismissing the
        // keyboard) keeps the draft so it isn't lost by accident.
        setText("");
        setReplyingTo(null);
        setEditingId(null);
        setEditText("");
        setImages([]);
        previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
        previewUrls.current = [];
    }, [postId]);

    useEffect(
        () => () => {
            previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
        },
        [],
    );

    useEffect(() => {
        if (open && replyingTo) inputRef.current?.focus();
    }, [open, replyingTo]);

    const removeImage = (index: number) => {
        const target = images[index];
        if (target) {
            URL.revokeObjectURL(target.url);
            previewUrls.current = previewUrls.current.filter(
                (url) => url !== target.url,
            );
        }
        setImages((previous) => previous.filter((_, i) => i !== index));
    };

    const pickImages = async () => {
        if (preparing) return;

        const remaining = MAX_COMMENT_IMAGES - images.length;
        if (remaining <= 0) {
            toast.info(`最多只能添加 ${MAX_COMMENT_IMAGES} 张图片`);
            return;
        }

        let picked: File[];
        try {
            picked = await showFilesPicker("image/*");
        } catch {
            // The user cancelled the file picker.
            return;
        }

        const selected = picked.slice(0, remaining);
        if (picked.length > remaining) {
            toast.info(`最多只能添加 ${MAX_COMMENT_IMAGES} 张图片`);
        }

        setPreparing(true);
        try {
            const results = await toastPromise(
                Promise.allSettled(
                    selected.map((file, index) => prepareImage(file, index)),
                ),
                {
                    loading: "压缩图片中...",
                    success: (settled) =>
                        settled.some((result) => result.status === "fulfilled")
                            ? "图片已添加"
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
            // toastPromise already surfaced the failure.
        } finally {
            setPreparing(false);
        }
    };

    const submit = async () => {
        const value = text.trim();
        if (
            (!value && images.length === 0) ||
            commentTextError(value, images.length) ||
            newComment.isPending ||
            preparing
        ) {
            return;
        }

        // The target may have been deleted (or cascade-deleted) meanwhile.
        const replyTo =
            replyingTo && commentsById.has(replyingTo.id) ? replyingTo : null;

        try {
            await toastPromise(
                newComment.mutateAsync({
                    text: value,
                    parentId: replyTo?.id,
                    images: images.map((image) => image.file),
                }),
                {
                    loading: replyTo ? "回复中..." : "发布评论中...",
                    success: replyTo ? "回复成功" : "评论成功",
                    error: "发布失败",
                },
            );
            setText("");
            setReplyingTo(null);
            previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
            previewUrls.current = [];
            setImages([]);
        } catch {
            // toastPromise already surfaced the error.
        }
    };

    const startReply = (comment: CommentData) => {
        // Reply and edit share the comment body, so keep only one active.
        setEditingId(null);
        setEditText("");
        setReplyingTo(comment);
    };

    const startEdit = (comment: CommentData) => {
        setReplyingTo(null);
        setEditingId(comment.id);
        setEditText(comment.text);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditText("");
    };

    const saveEdit = async (comment: CommentData) => {
        const value = editText.trim();
        if (commentTextError(value, comment.images.length)) return;
        // Save only real changes: an unchanged PATCH would still bump
        // `updated` and falsely label the comment as 已编辑.
        if (value === comment.text.trim()) {
            cancelEdit();
            return;
        }

        try {
            await toastPromise(
                editComment.mutateAsync({ id: comment.id, text: value }),
                {
                    loading: "保存中...",
                    success: "评论已更新",
                    error: "保存失败",
                },
            );
            cancelEdit();
        } catch {
            // toastPromise already surfaced the error; keep the editor open.
        }
    };

    const removeComment = async (comment: CommentData) => {
        try {
            await toastPromise(deleteComment.mutateAsync({ id: comment.id }), {
                loading: "删除中...",
                success: "评论已删除",
                error: "删除失败",
            });
            if (replyingTo?.id === comment.id) setReplyingTo(null);
            if (editingId === comment.id) cancelEdit();
        } catch {
            // toastPromise already surfaced the error.
        }
    };

    const openViewer = (images: ViewerImage[], index: number) =>
        setViewer({ images, index });

    return (
        <>
            <Drawer open={open} onOpenChange={onOpenChange}>
                <DrawerContent
                    className="kb-max-h h-[80dvh]"
                    // vaul turns off text selection on fine pointers so that
                    // dragging the sheet never selects text. That also broke
                    // selecting comment text on a PC; this sheet is read-heavy,
                    // so opt back in (touch devices keep vaul's default).
                    style={{ userSelect: "text" }}
                >
                    <DrawerHeader className="border-b pb-3 text-center">
                        <DrawerTitle className="text-base">
                            评论
                            {comments.length > 0 ? ` (${comments.length})` : ""}
                        </DrawerTitle>
                        <DrawerDescription className="sr-only">
                            查看和发布评论
                        </DrawerDescription>
                    </DrawerHeader>

                    <div className="min-h-0 flex-1 overflow-y-auto px-4">
                        {isPending ? (
                            <div className="flex justify-center py-10">
                                <LoadingSpinner />
                            </div>
                        ) : threads.length === 0 ? (
                            <p className="py-10 text-center text-sm text-muted-foreground">
                                还没有评论，来说点什么吧
                            </p>
                        ) : (
                            <ul className="divide-y">
                                {threads.map(({ root, replies }) => {
                                    const rootLabel =
                                        root.text ||
                                        (root.images.length > 0
                                            ? "图片评论"
                                            : "评论");

                                    return (
                                        <li key={root.id} className="py-3">
                                            <div className="flex gap-2">
                                                <AvatarPreview
                                                    size={32}
                                                    user={root.author}
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-baseline justify-between gap-2">
                                                        <span className="truncate text-sm font-semibold">
                                                            {root.author
                                                                .user_name ||
                                                                "朋友"}
                                                        </span>
                                                        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                                                            <time
                                                                dateTime={
                                                                    root.createdAt
                                                                }
                                                            >
                                                                {formatRelativeTime(
                                                                    root.createdAt,
                                                                )}
                                                            </time>
                                                            {isCommentEdited(
                                                                root,
                                                            ) && (
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
                                                            hasImages={
                                                                root.images
                                                                    .length > 0
                                                            }
                                                            pending={
                                                                editComment.isPending
                                                            }
                                                            onChange={
                                                                setEditText
                                                            }
                                                            onCancel={
                                                                cancelEdit
                                                            }
                                                            onSave={() =>
                                                                void saveEdit(
                                                                    root,
                                                                )
                                                            }
                                                        />
                                                    ) : (
                                                        root.text && (
                                                            <p className="whitespace-pre-wrap break-words text-sm">
                                                                {root.text}
                                                            </p>
                                                        )
                                                    )}
                                                    <CommentImages
                                                        comment={root}
                                                        onOpen={openViewer}
                                                    />
                                                    {editingId !== root.id && (
                                                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                                                            <button
                                                                type="button"
                                                                className="hover:text-foreground"
                                                                aria-label={`回复 ${rootLabel}`}
                                                                onClick={() =>
                                                                    startReply(
                                                                        root,
                                                                    )
                                                                }
                                                            >
                                                                回复
                                                            </button>
                                                            {root.author.id ===
                                                                user.id && (
                                                                <button
                                                                    type="button"
                                                                    className="hover:text-foreground"
                                                                    aria-label={`编辑 ${rootLabel}`}
                                                                    onClick={() =>
                                                                        startEdit(
                                                                            root,
                                                                        )
                                                                    }
                                                                >
                                                                    编辑
                                                                </button>
                                                            )}
                                                            {root.author.id ===
                                                                user.id && (
                                                                <button
                                                                    type="button"
                                                                    className="hover:text-red-500"
                                                                    aria-label={`删除 ${rootLabel}`}
                                                                    onClick={() =>
                                                                        removeComment(
                                                                            root,
                                                                        )
                                                                    }
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
                                                            (reply.images
                                                                .length > 0
                                                                ? "图片回复"
                                                                : "回复");

                                                        return (
                                                            <li
                                                                key={reply.id}
                                                                className="text-sm leading-5"
                                                            >
                                                                {editingId ===
                                                                reply.id ? (
                                                                    <>
                                                                        <p className="text-muted-foreground">
                                                                            <span className="font-semibold text-foreground">
                                                                                {reply
                                                                                    .author
                                                                                    .user_name ||
                                                                                    "朋友"}
                                                                            </span>
                                                                            {
                                                                                " 回复 "
                                                                            }
                                                                            <span className="font-semibold text-foreground">
                                                                                {commentsById.get(
                                                                                    reply.parentId,
                                                                                )
                                                                                    ?.author
                                                                                    .user_name ||
                                                                                    "该评论"}
                                                                            </span>
                                                                        </p>
                                                                        <InlineCommentEditor
                                                                            key={
                                                                                reply.id
                                                                            }
                                                                            value={
                                                                                editText
                                                                            }
                                                                            hasImages={
                                                                                reply
                                                                                    .images
                                                                                    .length >
                                                                                0
                                                                            }
                                                                            pending={
                                                                                editComment.isPending
                                                                            }
                                                                            onChange={
                                                                                setEditText
                                                                            }
                                                                            onCancel={
                                                                                cancelEdit
                                                                            }
                                                                            onSave={() =>
                                                                                void saveEdit(
                                                                                    reply,
                                                                                )
                                                                            }
                                                                        />
                                                                    </>
                                                                ) : (
                                                                    <p className="whitespace-pre-wrap break-words">
                                                                        <span className="font-semibold">
                                                                            {reply
                                                                                .author
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
                                                                            )
                                                                                ?.author
                                                                                .user_name ||
                                                                                "该评论"}
                                                                        </span>
                                                                        {reply.text && (
                                                                            <span>
                                                                                ：
                                                                                {
                                                                                    reply.text
                                                                                }
                                                                            </span>
                                                                        )}
                                                                    </p>
                                                                )}
                                                                <CommentImages
                                                                    comment={
                                                                        reply
                                                                    }
                                                                    compact
                                                                    onOpen={
                                                                        openViewer
                                                                    }
                                                                />
                                                                <div
                                                                    className={cn(
                                                                        "mt-0.5 flex items-center gap-3 text-xs text-muted-foreground",
                                                                        editingId ===
                                                                            reply.id &&
                                                                            "hidden",
                                                                    )}
                                                                >
                                                                    <time
                                                                        dateTime={
                                                                            reply.createdAt
                                                                        }
                                                                    >
                                                                        {formatRelativeTime(
                                                                            reply.createdAt,
                                                                        )}
                                                                    </time>
                                                                    {isCommentEdited(
                                                                        reply,
                                                                    ) && (
                                                                        <span aria-label="已编辑">
                                                                            已编辑
                                                                        </span>
                                                                    )}
                                                                    <button
                                                                        type="button"
                                                                        className="hover:text-foreground"
                                                                        aria-label={`回复 ${replyLabel}`}
                                                                        onClick={() =>
                                                                            startReply(
                                                                                reply,
                                                                            )
                                                                        }
                                                                    >
                                                                        回复
                                                                    </button>
                                                                    {reply
                                                                        .author
                                                                        .id ===
                                                                        user.id && (
                                                                        <button
                                                                            type="button"
                                                                            className="hover:text-foreground"
                                                                            aria-label={`编辑 ${replyLabel}`}
                                                                            onClick={() =>
                                                                                startEdit(
                                                                                    reply,
                                                                                )
                                                                            }
                                                                        >
                                                                            编辑
                                                                        </button>
                                                                    )}
                                                                    {reply
                                                                        .author
                                                                        .id ===
                                                                        user.id && (
                                                                        <button
                                                                            type="button"
                                                                            className="hover:text-red-500"
                                                                            aria-label={`删除 ${replyLabel}`}
                                                                            onClick={() =>
                                                                                removeComment(
                                                                                    reply,
                                                                                )
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
                        )}
                    </div>

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
                                    onClick={() => setReplyingTo(null)}
                                >
                                    取消
                                </button>
                            </div>
                        )}
                        {images.length > 0 && (
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                {images.map((image, index) => (
                                    <span
                                        key={image.url}
                                        className="relative block"
                                    >
                                        <img
                                            alt=""
                                            className="size-14 rounded-lg border border-border/60 object-cover"
                                            src={image.url}
                                        />
                                        <button
                                            type="button"
                                            className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-soft transition-colors hover:text-destructive"
                                            aria-label={`移除图片 ${index + 1}`}
                                            onClick={() => removeImage(index)}
                                        >
                                            <X
                                                className="size-3"
                                                aria-hidden="true"
                                            />
                                        </button>
                                    </span>
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
                                disabled={
                                    preparing ||
                                    images.length >= MAX_COMMENT_IMAGES
                                }
                                onClick={() => {
                                    void pickImages();
                                }}
                            >
                                <ImagePlus
                                    className="size-4"
                                    aria-hidden="true"
                                />
                            </Button>
                            <Textarea
                                ref={inputRef}
                                value={text}
                                onChange={(event) =>
                                    setText(event.target.value)
                                }
                                onKeyDown={(event) => {
                                    if (
                                        event.key === "Enter" &&
                                        !event.shiftKey
                                    ) {
                                        event.preventDefault();
                                        void submit();
                                    }
                                }}
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
                                onClick={() => {
                                    void submit();
                                }}
                                disabled={
                                    (!text.trim() && images.length === 0) ||
                                    newComment.isPending ||
                                    preparing
                                }
                                aria-label="发送评论"
                            >
                                <SendHorizontal
                                    className="size-4"
                                    aria-hidden="true"
                                />
                            </Button>
                        </div>
                    </div>
                </DrawerContent>
            </Drawer>

            {viewer && (
                <ImageViewer
                    images={viewer.images}
                    index={viewer.index}
                    open={viewer !== null}
                    onOpenChange={(next) => {
                        if (!next) setViewer(null);
                    }}
                />
            )}
        </>
    );
}
