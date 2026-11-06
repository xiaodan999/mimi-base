import { Fragment, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
    ArrowDown,
    ArrowUp,
    MessageCircle,
    Pencil,
    Search,
    SearchX,
} from "lucide-react";
import { useInView } from "react-intersection-observer";

import { ErrorState } from "@/components/ErrorState";
import { FeedSkeleton } from "@/components/FeedSkeleton";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import usePullToRefresh, {
    PULL_INDICATOR_HEIGHT,
    PULL_THRESHOLD,
} from "@/hooks/usePullToRefresh";
import useScrollToTop from "@/hooks/useScrollToTop";
import { cn } from "@/lib/utils";

import CommentSheet from "./-components/comment-sheet";
import FindSheet from "./-components/find-sheet";
import ImageViewer, { type ViewerImage } from "./-components/image-viewer";
import Post from "./-components/post";
import PostComposer from "./-components/post-composer";
import { usePostsInfinite, type PostData } from "./-data";
import { formatDayDivider, formatMonthLabel, isSameDay } from "./-utils";

/** The composer is either starting a post or editing one from the feed. */
type ComposerState = { mode: "new" } | { mode: "edit"; post: PostData } | null;

type PostsSearch = {
    /** "YYYY-MM" — the feed only shows that month. */
    month?: string;
    /** Case-insensitive text search over post bodies. */
    q?: string;
};

export const Route = createFileRoute("/_protected/_main/posts/")({
    validateSearch: (search: Record<string, unknown>): PostsSearch => {
        const month =
            typeof search.month === "string" &&
            /^\d{4}-(0[1-9]|1[0-2])$/.test(search.month)
                ? search.month
                : undefined;
        const q = typeof search.q === "string" ? search.q.trim() : "";
        return { month, q: q || undefined };
    },
    component: Posts,
});

function Posts() {
    const { month, q } = Route.useSearch();
    const navigate = Route.useNavigate();
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

    const { ref, inView } = useInView();
    // Reset to a single (newest) page instead of `refetch()`ing every loaded
    // page of the infinite feed.
    const pull = usePullToRefresh(() => refresh());
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
        <section className="px-3 pb-24 pt-3">
            {filtering && (
                <div className="sticky top-0 z-20 -mx-3 mb-2 flex h-10 items-center justify-between gap-3 border-b border-border/60 bg-background/90 px-4 backdrop-blur">
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
                <FeedSkeleton />
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

                        return (
                            <Fragment key={post.id}>
                                {showDivider && (
                                    <div
                                        className={cn(
                                            "sticky z-10 -mx-3 mb-2 px-3 py-1.5",
                                            filtering ? "top-10" : "top-0",
                                        )}
                                    >
                                        <span className="inline-flex rounded-full bg-background/85 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
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

            <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-[calc(1rem+env(safe-area-inset-left))]">
                <Button
                    variant="secondary"
                    size="icon"
                    className="size-12 rounded-full border border-border/60 shadow-soft"
                    onClick={() => setFindOpen(true)}
                    aria-label="查找动态"
                >
                    <Search className="size-5" />
                </Button>
            </div>

            <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] flex flex-col items-center gap-2">
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
        </>
    );
}
