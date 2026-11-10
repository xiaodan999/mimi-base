import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
    ArrowDown,
    ArrowUp,
    MessageCircle,
    Pencil,
    Search,
    SearchX,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useInView } from "react-intersection-observer";

import CommentSheet from "@/app/feed/components/comment-sheet";
import FindSheet from "@/app/feed/components/find-sheet";
import ImageViewer, {
    type ViewerImage,
} from "@/app/feed/components/image-viewer";
import Post from "@/app/feed/components/post";
import PostComposer from "@/app/feed/components/post-composer";
import VideoViewer from "@/app/feed/components/video-viewer";
import { type PostData, usePostsInfinite } from "@/app/feed/data";
import {
    formatDayDivider,
    formatMonthLabel,
    isSameDay,
} from "@/app/feed/utils";
import { ErrorState } from "@/components/ErrorState";
import { FeedLoading } from "@/components/FeedLoading";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import usePullToRefresh, {
    PULL_INDICATOR_HEIGHT,
    PULL_THRESHOLD,
} from "@/hooks/usePullToRefresh";
import useScrollToTop from "@/hooks/useScrollToTop";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

import MemoryCard from "./memory-card";

/** The composer is either starting a post or editing one from the feed. */
type ComposerState = { mode: "new" } | { mode: "edit"; post: PostData } | null;

/**
 * The 动态 feed under the home greeting card. It keeps the infinite list,
 * pull-to-refresh (which also refreshes the header stats) and the overlay
 * stack; the page above only owns the compact dashboard header.
 */
export default function HomeFeed() {
    const { month, q } = useSearch({ from: "/_protected/_main/home" });
    const navigate = useNavigate({ from: "/home" });
    const queryClient = useQueryClient();
    const filter = useMemo(() => ({ month, q }), [month, q]);

    const {
        data,
        isPending,
        isError,
        error,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        refetch,
        refresh,
    } = usePostsInfinite(8, filter);
    const [composer, setComposer] = useState<ComposerState>(null);
    const [findOpen, setFindOpen] = useState(false);
    const [commentPostId, setCommentPostId] = useState<string | null>(null);
    const [commentOpen, setCommentOpen] = useState(false);
    const [viewer, setViewer] = useState<{
        images: ViewerImage[];
        index: number;
    } | null>(null);
    const [videoViewer, setVideoViewer] = useState<string | null>(null);

    const { ref, inView } = useInView();
    // Reset to a single (newest) page instead of `refetch()`ing every loaded
    // page of the infinite feed. The header's stats live outside this chunk,
    // so refresh them too.
    const pull = usePullToRefresh(async () => {
        await Promise.all([
            refresh(),
            queryClient.invalidateQueries({ queryKey: qk.homeStats.all }),
        ]);
    });
    const pullProgress = Math.min(1, pull.distance / PULL_THRESHOLD);
    const { visible: showBackToTop, scrollToTop } = useScrollToTop();

    useEffect(() => {
        if (!inView || !hasNextPage || isFetchingNextPage) return;
        fetchNextPage();
    }, [fetchNextPage, hasNextPage, inView, isFetchingNextPage]);

    const posts = useMemo(
        () => data?.pages.flatMap((page) => page.posts) ?? [],
        [data],
    );
    const total = data?.pages[0]?.total ?? 0;
    const filtering = Boolean(month || q);
    const filterLabel = month
        ? `${formatMonthLabel(month)}${data ? ` · 共 ${total} 条` : ""}`
        : q
          ? `搜索「${q}」${data ? ` · 共 ${total} 条` : ""}`
          : "";

    // Filter changes replace the current entry so the back gesture still
    // leaves the page instead of stepping through every filter state.
    const clearFilter = async (closeSheet = false) => {
        if (!month && !q) {
            if (closeSheet) setFindOpen(false);
            return;
        }
        await navigate({ search: {}, replace: true });
        if (closeSheet) setFindOpen(false);
    };

    const selectMonth = async (next: string) => {
        if (next === month) {
            setFindOpen(false);
            return;
        }
        await navigate({ search: { month: next }, replace: true });
        setFindOpen(false);
    };

    const searchPosts = async (next: string) => {
        if (next === q) {
            setFindOpen(false);
            return;
        }
        await navigate({ search: { q: next }, replace: true });
        setFindOpen(false);
    };

    const content = (
        <section className="px-3 pt-2 pb-32">
            {filtering && (
                <div className="sticky top-0 z-20 -mx-3 mb-2 flex h-10 items-center justify-between gap-3 border-b border-border/60 bg-background/90 px-4 backdrop-blur-sm">
                    <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">
                        {filterLabel}
                    </span>
                    <button
                        type="button"
                        onClick={() => void clearFilter()}
                        className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
                    >
                        回到最新
                    </button>
                </div>
            )}

            {isPending ? (
                <FeedLoading />
            ) : isError ? (
                <ErrorState
                    message={error?.message ?? "未知错误"}
                    onRetry={() => void refetch()}
                />
            ) : (
                <>
                    {posts.map((post, index) => {
                        const previous = posts[index - 1];
                        const showDivider =
                            !previous ||
                            !isSameDay(previous.createdAt, post.createdAt);
                        // 去年今天 only matters once there is a feed to put it
                        // in; after the second post it reads as an aside, not
                        // as the page's main content.
                        const showMemory =
                            index === Math.min(1, posts.length - 1);

                        return (
                            <Fragment key={post.id}>
                                {showDivider && (
                                    <div
                                        // Decoration only: the full-width
                                        // transparent row must never swallow
                                        // taps aimed at what scrolls beneath
                                        // it (or at the floating buttons).
                                        className={cn(
                                            "pointer-events-none sticky z-10 -mx-3 mb-2 px-3 py-1.5",
                                            filtering ? "top-10" : "top-0",
                                        )}
                                    >
                                        <span className="inline-flex rounded-full bg-background/85 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur-sm">
                                            {formatDayDivider(post.createdAt)}
                                        </span>
                                    </div>
                                )}
                                <Post
                                    {...post}
                                    onEdit={() =>
                                        setComposer({
                                            mode: "edit",
                                            post,
                                        })
                                    }
                                    onOpenComments={() => {
                                        setCommentPostId(post.id);
                                        setCommentOpen(true);
                                    }}
                                    onOpenImage={(images, imageIndex) =>
                                        setViewer({
                                            images,
                                            index: imageIndex,
                                        })
                                    }
                                    onOpenVideo={setVideoViewer}
                                />
                                {showMemory && <MemoryCard />}
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
                                {filtering
                                    ? "这里看完了，换个范围试试"
                                    : "到底了..."}
                            </p>
                        ) : filtering ? (
                            <div className="mt-6 w-full rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
                                <SearchX className="mx-auto size-8 text-muted-foreground" />
                                <p className="mt-3 text-sm font-medium">
                                    {month
                                        ? "这个月还没有动态"
                                        : "没有找到相关动态"}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    换个关键词或月份试试
                                </p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="mt-4"
                                    onClick={() => void clearFilter()}
                                >
                                    回到最新
                                </Button>
                            </div>
                        ) : (
                            <div className="mt-6 w-full rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
                                <MessageCircle className="mx-auto size-8 text-muted-foreground" />
                                <p className="mt-3 text-sm font-medium">
                                    还没有动态
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    点右下角的按钮，记录第一条吧
                                </p>
                            </div>
                        )}
                    </div>
                </>
            )}
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
                    <span className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/95 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-soft backdrop-blur-sm">
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

            {/* Floating actions share the right edge, away from the
                left-aligned day dividers, so a date chip can never cover a
                button. z-30 keeps them above the sticky date rows (z-10)
                and the filter bar (z-20); the day rows are also
                pointer-events-none so they cannot swallow taps. */}
            <div className="fixed right-[calc(1rem+env(safe-area-inset-right))] bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex flex-col items-center gap-2">
                {showBackToTop && (
                    <Button
                        variant="secondary"
                        size="icon"
                        className="size-11 rounded-full border border-border/60 shadow-soft"
                        onClick={scrollToTop}
                        aria-label="回到顶部"
                    >
                        <ArrowUp className="size-5" />
                    </Button>
                )}
                <Button
                    variant="secondary"
                    size="icon"
                    className="size-12 rounded-full border border-border/60 shadow-soft"
                    onClick={() => setFindOpen(true)}
                    aria-label="查找动态"
                >
                    <Search className="size-5" />
                </Button>
                <Button
                    className="size-14 rounded-full p-0"
                    onClick={() => setComposer({ mode: "new" })}
                    aria-label="发布动态"
                >
                    <Pencil className="size-[50%]" />
                </Button>
            </div>

            <FindSheet
                open={findOpen}
                onOpenChange={setFindOpen}
                activeMonth={month}
                activeQuery={q}
                onSelectMonth={(next) => void selectMonth(next)}
                onSearch={(next) => void searchPosts(next)}
                onClear={() => void clearFilter(true)}
            />

            <PostComposer
                open={composer !== null}
                onOpenChange={(open) => {
                    if (!open) setComposer(null);
                }}
                editing={composer?.mode === "edit" ? composer.post : null}
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

            {videoViewer && (
                <VideoViewer
                    url={videoViewer}
                    open={videoViewer !== null}
                    onOpenChange={(open) => {
                        if (!open) setVideoViewer(null);
                    }}
                />
            )}
        </>
    );
}
