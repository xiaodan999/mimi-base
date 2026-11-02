import { useEffect, useMemo, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";

import TouXiang from "@/components/TouXiang";
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
import { useAuth } from "@/lib/auth";
import { getUserAvatarUrl, getUserCircleUrl } from "@/lib/pb";
import { toastPromise } from "@/lib/toast-promise";

import {
    buildCommentThreads,
    useComments,
    useDeleteCommentMutation,
    useNewCommentMutation,
    type CommentData,
} from "../-comments";
import { formatRelativeTime } from "../-utils";

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
    const { user } = useAuth();
    const { data: comments = [], isPending } = useComments(
        postId ?? "",
        open && !!postId,
    );
    const newComment = useNewCommentMutation(postId ?? "");
    const deleteComment = useDeleteCommentMutation(postId ?? "");
    const [text, setText] = useState("");
    const [replyingTo, setReplyingTo] = useState<CommentData | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const threads = useMemo(() => buildCommentThreads(comments), [comments]);
    const commentsById = useMemo(
        () => new Map(comments.map((comment) => [comment.id, comment])),
        [comments],
    );

    useEffect(() => {
        if (!open) {
            setText("");
            setReplyingTo(null);
        }
    }, [open]);

    useEffect(() => {
        if (open && replyingTo) inputRef.current?.focus();
    }, [open, replyingTo]);

    const submit = async () => {
        const value = text.trim();
        if (!value || newComment.isPending) return;

        // The target may have been deleted (or cascade-deleted) meanwhile.
        const replyTo =
            replyingTo && commentsById.has(replyingTo.id) ? replyingTo : null;

        try {
            await toastPromise(
                newComment.mutateAsync({
                    text: value,
                    parentId: replyTo?.id,
                }),
                {
                    loading: replyTo ? "回复中..." : "发布评论中...",
                    success: replyTo ? "回复成功" : "评论成功",
                    error: "发布失败",
                },
            );
            setText("");
            setReplyingTo(null);
        } catch {
            // toastPromise already surfaced the error.
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
        } catch {
            // toastPromise already surfaced the error.
        }
    };

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent className="h-[80dvh]">
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
                            {threads.map(({ root, replies }) => (
                                <li key={root.id} className="py-3">
                                    <div className="flex gap-2">
                                        <TouXiang
                                            className="shrink-0"
                                            size={32}
                                            touXiangUrl={getUserAvatarUrl(
                                                root.author,
                                            )}
                                            circleUrl={getUserCircleUrl(
                                                root.author,
                                            )}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-baseline justify-between gap-2">
                                                <span className="truncate text-sm font-semibold">
                                                    {root.author.user_name}
                                                </span>
                                                <time
                                                    className="shrink-0 text-xs text-muted-foreground"
                                                    dateTime={root.createdAt}
                                                >
                                                    {formatRelativeTime(
                                                        root.createdAt,
                                                    )}
                                                </time>
                                            </div>
                                            <p className="whitespace-pre-wrap break-words text-sm">
                                                {root.text}
                                            </p>
                                            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                                                <button
                                                    type="button"
                                                    className="hover:text-foreground"
                                                    aria-label={`回复 ${root.text}`}
                                                    onClick={() =>
                                                        setReplyingTo(root)
                                                    }
                                                >
                                                    回复
                                                </button>
                                                {root.author.id === user.id && (
                                                    <button
                                                        type="button"
                                                        className="hover:text-red-500"
                                                        aria-label={`删除 ${root.text}`}
                                                        onClick={() =>
                                                            removeComment(root)
                                                        }
                                                    >
                                                        删除
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {replies.length > 0 && (
                                        <ul className="mt-2 space-y-1.5 rounded-md bg-black/5 px-3 py-2">
                                            {replies.map((reply) => (
                                                <li
                                                    key={reply.id}
                                                    className="text-sm leading-5"
                                                >
                                                    <p className="whitespace-pre-wrap break-words">
                                                        <span className="font-semibold">
                                                            {
                                                                reply.author
                                                                    .user_name
                                                            }
                                                        </span>
                                                        <span className="text-muted-foreground">
                                                            {" "}
                                                            回复{" "}
                                                        </span>
                                                        <span className="font-semibold">
                                                            {commentsById.get(
                                                                reply.parentId,
                                                            )?.author
                                                                .user_name ??
                                                                "该评论"}
                                                        </span>
                                                        <span>
                                                            ：{reply.text}
                                                        </span>
                                                    </p>
                                                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                                                        <time
                                                            dateTime={
                                                                reply.createdAt
                                                            }
                                                        >
                                                            {formatRelativeTime(
                                                                reply.createdAt,
                                                            )}
                                                        </time>
                                                        <button
                                                            type="button"
                                                            className="hover:text-foreground"
                                                            aria-label={`回复 ${reply.text}`}
                                                            onClick={() =>
                                                                setReplyingTo(
                                                                    reply,
                                                                )
                                                            }
                                                        >
                                                            回复
                                                        </button>
                                                        {reply.author.id ===
                                                            user.id && (
                                                            <button
                                                                type="button"
                                                                className="hover:text-red-500"
                                                                aria-label={`删除 ${reply.text}`}
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
                                            ))}
                                        </ul>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="border-t p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                    {replyingTo && (
                        <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-1.5 text-xs">
                            <span className="truncate">
                                回复{" "}
                                <span className="font-semibold">
                                    @{replyingTo.author.user_name}
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
                    <div className="flex items-end gap-2">
                        <Textarea
                            ref={inputRef}
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    submit();
                                }
                            }}
                            placeholder={
                                replyingTo
                                    ? `回复 ${replyingTo.author.user_name}...`
                                    : "说点什么..."
                            }
                            rows={1}
                            className="max-h-24 min-h-10 resize-none"
                        />
                        <Button
                            type="button"
                            size="icon"
                            onClick={submit}
                            disabled={!text.trim() || newComment.isPending}
                            aria-label="发送评论"
                        >
                            <SendHorizontal className="size-4" />
                        </Button>
                    </div>
                </div>
            </DrawerContent>
        </Drawer>
    );
}
