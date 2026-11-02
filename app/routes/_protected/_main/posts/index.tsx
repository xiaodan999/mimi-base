import { Fragment, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { useInView } from "react-intersection-observer";

import LoadingPage from "@/components/LoadingPage";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

import CommentSheet from "./-components/comment-sheet";
import ImageViewer, { type ViewerImage } from "./-components/image-viewer";
import NewPost from "./-components/new-post";
import Post from "./-components/post";
import { usePostsInfinite } from "./-data";
import { formatDayDivider, isSameDay } from "./-utils";

export const Route = createFileRoute("/_protected/_main/posts/")({
    component: Posts,
});

function Posts() {
    const {
        data,
        isPending,
        isError,
        error,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = usePostsInfinite(8);
    const [showNewPostDrawer, setShowNewPostDrawer] = useState(false);
    const [commentPostId, setCommentPostId] = useState<string | null>(null);
    const [commentOpen, setCommentOpen] = useState(false);
    const [viewer, setViewer] = useState<{
        images: ViewerImage[];
        index: number;
    } | null>(null);

    const { ref, inView } = useInView();

    useEffect(() => {
        if (!inView || !hasNextPage || isFetchingNextPage) return;
        fetchNextPage();
    }, [fetchNextPage, hasNextPage, inView, isFetchingNextPage]);

    const posts = useMemo(
        () => data?.pages.flatMap((page) => page.posts) ?? [],
        [data],
    );

    if (isPending) return <LoadingPage />;
    if (isError) {
        return (
            <div className="p-6 text-center text-sm text-muted-foreground">
                出错啦：{error?.message ?? "未知错误"}
            </div>
        );
    }

    return (
        <>
            <section className="divide-y divide-black/5 pb-24">
                {posts.map((post, index) => {
                    const previous = posts[index - 1];
                    const showDivider =
                        !previous ||
                        !isSameDay(previous.createdAt, post.createdAt);

                    return (
                        <Fragment key={post.id}>
                            {showDivider && (
                                <div className="bg-black/5 px-4 py-2 text-center text-xs text-muted-foreground">
                                    {formatDayDivider(post.createdAt)}
                                </div>
                            )}
                            <Post
                                {...post}
                                onOpenComments={() => {
                                    setCommentPostId(post.id);
                                    setCommentOpen(true);
                                }}
                                onOpenImage={(images, imageIndex) =>
                                    setViewer({ images, index: imageIndex })
                                }
                            />
                        </Fragment>
                    );
                })}

                <div className="flex min-h-10 items-center justify-center py-2">
                    {hasNextPage ? (
                        <div ref={ref} className="flex h-8 items-center">
                            {isFetchingNextPage && <LoadingSpinner />}
                        </div>
                    ) : posts.length > 0 ? (
                        <p className="text-xs text-muted-foreground">
                            到底了...
                        </p>
                    ) : (
                        <p className="py-16 text-sm text-muted-foreground">
                            还没有动态，点右下角记录一条吧
                        </p>
                    )}
                </div>
            </section>

            <Drawer
                open={showNewPostDrawer}
                onOpenChange={setShowNewPostDrawer}
            >
                <div className="fixed bottom-[70px] right-4">
                    <Button
                        className="size-14 rounded-full p-0"
                        onClick={() => setShowNewPostDrawer(true)}
                        aria-label="发布动态"
                    >
                        <Pencil className="size-[50%]" />
                    </Button>
                </div>

                <DrawerContent>
                    <NewPost
                        onClose={() => setShowNewPostDrawer(false)}
                        onSuccess={() => setShowNewPostDrawer(false)}
                    />
                </DrawerContent>
            </Drawer>

            <CommentSheet
                postId={commentPostId}
                open={commentOpen}
                onOpenChange={setCommentOpen}
            />

            {viewer && (
                <ImageViewer
                    images={viewer.images}
                    index={viewer.index}
                    open={viewer !== null}
                    onOpenChange={(open) => {
                        if (!open) setViewer(null);
                    }}
                />
            )}
        </>
    );
}
