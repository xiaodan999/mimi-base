import { useEffect, useState } from "react";
import { SendHorizontal, Trash2 } from "lucide-react";

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
    useComments,
    useDeleteCommentMutation,
    useNewCommentMutation,
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

    useEffect(() => {
        if (!open) setText("");
    }, [open]);

    const submit = async () => {
        const value = text.trim();
        if (!value || newComment.isPending) return;

        try {
            await toastPromise(newComment.mutateAsync({ text: value }), {
                loading: "发布评论中...",
                success: "评论成功",
                error: "评论失败",
            });
            setText("");
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
                    ) : comments.length === 0 ? (
                        <p className="py-10 text-center text-sm text-muted-foreground">
                            还没有评论，来说点什么吧
                        </p>
                    ) : (
                        <ul className="divide-y">
                            {comments.map((comment) => (
                                <li
                                    key={comment.id}
                                    className="flex gap-2 py-3"
                                >
                                    <TouXiang
                                        className="shrink-0"
                                        size={32}
                                        touXiangUrl={getUserAvatarUrl(
                                            comment.author,
                                        )}
                                        circleUrl={getUserCircleUrl(
                                            comment.author,
                                        )}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <span className="truncate text-sm font-semibold">
                                                {comment.author.user_name}
                                            </span>
                                            <time
                                                className="shrink-0 text-xs text-muted-foreground"
                                                dateTime={comment.createdAt}
                                            >
                                                {formatRelativeTime(
                                                    comment.createdAt,
                                                )}
                                            </time>
                                        </div>
                                        <p className="whitespace-pre-wrap break-words text-sm">
                                            {comment.text}
                                        </p>
                                    </div>
                                    {comment.author.id === user.id && (
                                        <button
                                            type="button"
                                            aria-label="删除评论"
                                            className="self-start p-1 text-muted-foreground hover:text-red-500"
                                            onClick={async () => {
                                                try {
                                                    await toastPromise(
                                                        deleteComment.mutateAsync(
                                                            { id: comment.id },
                                                        ),
                                                        {
                                                            loading:
                                                                "删除中...",
                                                            success:
                                                                "评论已删除",
                                                            error: "删除失败",
                                                        },
                                                    );
                                                } catch {
                                                    // toastPromise already
                                                    // surfaced the error.
                                                }
                                            }}
                                        >
                                            <Trash2 className="size-4" />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex items-end gap-2 border-t p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                    <Textarea
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                submit();
                            }
                        }}
                        placeholder="说点什么..."
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
            </DrawerContent>
        </Drawer>
    );
}
