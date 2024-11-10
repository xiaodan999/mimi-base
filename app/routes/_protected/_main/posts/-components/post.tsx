import { HeartFill } from "antd-mobile-icons";
import { format } from "date-fns/esm";
import { Ellipsis, Heart, MessageCircle, Trash2 } from "lucide-react";

import TouXiang from "@/components/TouXiang";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toastPromise } from "@/lib/toast-promise";

import { PostData, useDeletePostMutation, usePostLikeMutation } from "../-data";

export default function Post({
    id,
    author,
    text,
    createdAt,
    metrics,
    liked,
}: PostData) {
    const likeMutation = usePostLikeMutation();
    const deleteMutation = useDeletePostMutation();

    return (
        <article className="px-4 py-3">
            <div className="row flex gap-2">
                {/* profile image */}
                <TouXiang
                    circleUrl={author.circle}
                    size={40}
                    touXiangUrl={author.tou_xiang}
                />
                {/* main content */}
                <div className="flex-1">
                    {/* author info */}
                    <div className="row mb-[2px] flex h-5 justify-between font-bold leading-5">
                        <div>
                            <span>{author.user_name}</span>
                        </div>

                        <DropdownMenu>
                            <DropdownMenuTrigger>
                                <Ellipsis />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem
                                    className="text-red-600 hover:cursor-pointer hover:!bg-red-100 hover:!text-red-600"
                                    onClick={() => {
                                        toastPromise(
                                            deleteMutation.mutateAsync({ id }),
                                            {
                                                loading: "删除中...",
                                                success: "成功此帖子",
                                                error: "删除失败",
                                            },
                                        );
                                    }}
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    <span>删除</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    {/* text */}
                    <div>{text}</div>
                    {/* images */}
                    <div className="mt-2">
                        <time
                            className="text-sm font-normal text-muted-foreground"
                            dateTime={new Date().toISOString()}
                        >
                            {format(
                                new Date(createdAt),
                                "yyyy年MM月dd日 HH:mm",
                            )}
                        </time>
                    </div>
                    {/* interactions */}
                    <div className="mt-3 flex flex-row justify-start gap-4">
                        <Button
                            type="button"
                            className="h-5 p-0"
                            variant="ghost"
                        >
                            <MessageCircle className="size-4" />
                            <span className="pl-1 leading-4">
                                {metrics.replyCount}
                            </span>
                        </Button>

                        <Button
                            type="button"
                            className="h-5 p-0"
                            variant="ghost"
                            onClick={async () => {
                                const newLikeState = !liked;
                                // setLikePost((prev) => !prev);
                                // setPostLikes((prev) =>
                                //     newLikeState ? prev + 1 : prev - 1,
                                // );
                                await likeMutation.mutateAsync({
                                    postId: id,
                                    like: newLikeState,
                                });
                            }}
                        >
                            {liked ? (
                                <HeartFill className="size-4" />
                            ) : (
                                <Heart className="size-4" />
                            )}
                            <span className="pl-1 leading-4">
                                {metrics.likeCount}
                            </span>
                        </Button>
                    </div>
                </div>
            </div>
        </article>
    );
}
