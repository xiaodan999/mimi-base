import { Fragment, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, Pencil, MessageCircle } from "lucide-react";
import { useInView } from "react-intersection-observer";

import { ErrorState } from "@/components/ErrorState";
import { FeedSkeleton } from "@/components/FeedSkeleton";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import usePullToRefresh, {
    PULL_INDICATOR_HEIGHT,
    PULL_THRESHOLD,
} from "@/hooks/usePullToRefresh";
import { cn } from "@/lib/utils";

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
        refetch,
    } = usePostsInfinite(8);
    const [showNewPostDrawer, setShowNewPostDrawer] = useState(false);
    const [commentPostId, setCommentPostId] = useState<string | null>(null);
    const [commentOpen, setCommentOpen] = useState(false);
    const [viewer, setViewer] = useState<{
        images: ViewerImage[];
        index: number;
    } | null>(null);

    const { ref, inView } = useInView();
    const pull = usePullToRefresh(() => refetch());
    const pullProgress = Math.min(1, pull.distance / PULL_THRESHOLD);

    useEffect(() => {
        if (!inView || !hasNextPage || isFetchingNextPage) return;
        fetchNextPage();
    }, [fetchNextPage, hasNextPage, inView, isFetchingNextPage]);

    const posts = useMemo(
        () => data?.pages.flatMap((page) => page.posts) ?? [],
        [data],
    );

    const content = isPending ? (
        <FeedSkeleton />
    ) : isError ? (
        <ErrorState
            message={error?.message ?? "未知错误"}
            onRetry={() => void refetch()}
        />
    ) : (
        <section className="px-3 pb-24 pt-3">
            {posts.map((post, index) => {
                const previous = posts[index - 1];
                const showDivider =
                    !previous || !isSameDay(previous.createdAt, post.createdAt);

                return (
                    <Fragment key={post.id}>
                        {showDivider && (
                            <div className="sticky top-0 z-10 -mx-3 mb-2 px-3 py-1.5">
                                <span className="inline-flex rounded-full bg-background/85 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
                                    {formatDayDivider(post.createdAt)}
                                </span>
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
                    <p className="text-xs text-muted-foreground">到底了...</p>
                ) : (
                    <div className="mt-6 w-full rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
                        <MessageCircle className="mx-auto size-8 text-muted-foreground" />
                        <p className="mt-3 text-sm font-medium">还没有动态</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            点右下角的按钮，记录第一条吧
                        </p>
                    </div>
                )}
            </div>
        </section>
    );

    return (
        <>
            <div ref={pull.ref} className="relative">
                {/* Slides into the gap the pull opens above the feed. */}
                <div
                    aria-hidden={pull.distance === 0}
                    className={cn(
                        "pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-center",
                        !pull.dragging &&
                            "transition-[transform,opacity] duration-300 ease-out",
                    )}
                    style={{
                        height: PULL_INDICATOR_HEIGHT,
                        transform: `translateY(${pull.distance - PULL_INDICATOR_HEIGHT}px)`,
                        opacity: Math.min(1, pull.distance / 24),
                    }}
                >
                    <span className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/95 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-soft backdrop-blur">
                        {pull.refreshing ? (
                            <LoadingSpinner size={14} />
                        ) : (
                            <ArrowDown
                                size={14}
                                style={{
                                    transform: `rotate(${pullProgress * 180}deg)`,
                                }}
                            />
                        )}
                        {pull.refreshing
                            ? "刷新中…"
                            : pullProgress >= 1
                              ? "松开刷新"
                              : "下拉刷新"}
                    </span>
                </div>

                <div
                    className={cn(
                        !pull.dragging &&
                            "transition-transform duration-300 ease-out",
                    )}
                    style={
                        pull.distance > 0
                            ? {
                                  transform: `translateY(${pull.distance}px)`,
                              }
                            : undefined
                    }
                >
                    {content}
                </div>
            </div>

            <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4">
                <Button
                    className="size-14 rounded-full p-0"
                    onClick={() => setShowNewPostDrawer(true)}
                    aria-label="发布动态"
                >
                    <Pencil className="size-[50%]" />
                </Button>
            </div>

            <NewPost
                open={showNewPostDrawer}
                onOpenChange={setShowNewPostDrawer}
            />

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
