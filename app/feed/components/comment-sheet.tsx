import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer";
import { useCurrentUser } from "@/lib/auth";
import prepareImage from "@/lib/prepareImage";
import { showFilesPicker } from "@/lib/showFilePicker";
import { toastPromise } from "@/lib/toast-promise";

import { commentTextError } from "../comment-edit";
import {
    buildCommentThreads,
    type CommentData,
    useComments,
    useDeleteCommentMutation,
    useEditCommentMutation,
    useNewCommentMutation,
} from "../comments";
import CommentComposer, {
    type CommentImageDraft,
    MAX_COMMENT_IMAGES,
} from "./comment-composer";
import CommentList from "./comment-list";
import ImageViewer, { type ViewerImage } from "./image-viewer";

type CommentSheetProps = {
    postId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export default function CommentSheet({
    postId,
    open,
    onOpenChange,
}: CommentSheetProps) {
    const user = useCurrentUser();
    const {
        data: comments = [],
        isPending,
        isError,
        refetch,
    } = useComments(postId ?? "", open && !!postId);
    const newComment = useNewCommentMutation(postId ?? "");
    const editComment = useEditCommentMutation(postId ?? "");
    const deleteComment = useDeleteCommentMutation(postId ?? "");
    const [text, setText] = useState("");
    const [replyingTo, setReplyingTo] = useState<CommentData | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");
    const [deleteTarget, setDeleteTarget] = useState<CommentData | null>(null);
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
        setDeleteTarget(null);
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

    const removeComment = async () => {
        if (!deleteTarget) return;
        const comment = deleteTarget;
        try {
            await toastPromise(deleteComment.mutateAsync({ id: comment.id }), {
                loading: "删除中...",
                success: "评论已删除",
                error: "删除失败",
            });
            if (replyingTo?.id === comment.id) setReplyingTo(null);
            if (editingId === comment.id) cancelEdit();
            setDeleteTarget(null);
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
                    className="kb-max-h mx-auto h-[80dvh] w-full max-w-2xl"
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
                        <CommentList
                            threads={threads}
                            commentsById={commentsById}
                            isPending={isPending}
                            isError={isError}
                            editingId={editingId}
                            editText={editText}
                            editPending={editComment.isPending}
                            currentUserId={user.id}
                            onRefetch={() => void refetch()}
                            onChangeEditText={setEditText}
                            onCancelEdit={cancelEdit}
                            onSaveEdit={(comment) => void saveEdit(comment)}
                            onStartReply={startReply}
                            onStartEdit={startEdit}
                            onDelete={setDeleteTarget}
                            onOpenViewer={openViewer}
                        />
                    </div>

                    <CommentComposer
                        text={text}
                        replyingTo={replyingTo}
                        images={images}
                        preparing={preparing}
                        pending={newComment.isPending}
                        inputRef={inputRef}
                        onTextChange={setText}
                        onCancelReply={() => setReplyingTo(null)}
                        onRemoveImage={removeImage}
                        onPickImages={() => void pickImages()}
                        onSubmit={() => void submit()}
                    />
                </DrawerContent>
            </Drawer>

            <ConfirmDialog
                open={deleteTarget !== null}
                onOpenChange={(next) => {
                    if (!next) setDeleteTarget(null);
                }}
                title="删除这条评论？"
                description="删除后无法恢复；如果这条评论下面有回复，回复也会一起删除。"
                confirmLabel="删除"
                destructive
                busy={deleteComment.isPending}
                onConfirm={() => void removeComment()}
            />

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
