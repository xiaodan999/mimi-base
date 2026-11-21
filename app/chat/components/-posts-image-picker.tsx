import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { imageToDataUrl } from "@/app/ai/image";
import { type RecentImagePost, useRecentImagePosts } from "@/app/feed/data";
import { EmptyState } from "@/components/EmptyState";
import { MediaGrid, MediaTile } from "@/components/MediaGrid";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { getFileUrl } from "@/lib/pb";
import { pairThumbs } from "@/lib/photoFiles";

/**
 * Pick an image you already posted: the grid shows recent posts' images;
 * tapping one downloads it (with the short-lived file token) and converts it
 * to the same data-URL pipeline as freshly picked photos.
 */
export function PostsImagePicker({
    open,
    onOpenChange,
    onPicked,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onPicked: (dataUrl: string) => void;
}) {
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const postsQuery = useRecentImagePosts(open);
    const posts = useMemo(() => postsQuery.data ?? [], [postsQuery.data]);

    const pick = async (post: RecentImagePost, filename: string) => {
        const key = `${post.id}:${filename}`;
        setLoadingId(key);
        try {
            const url = getFileUrl(post, filename);
            const res = await fetch(url);
            if (!res.ok) throw new Error(String(res.status));
            const blob = await res.blob();
            const dataUrl = await imageToDataUrl(blob, { maxSize: 1024 });
            onPicked(dataUrl);
            onOpenChange(false);
        } catch {
            toast.error("图片取不出来，稍后再试");
        } finally {
            setLoadingId(null);
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="mx-auto flex max-h-[70dvh] w-full max-w-xl flex-col gap-2 px-4 pb-6"
            >
                <SheetHeader className="shrink-0 text-left">
                    <SheetTitle>从动态选择图片</SheetTitle>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    {postsQuery.isLoading && (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                            <Loader2 className="size-5 animate-spin" />
                        </div>
                    )}
                    {postsQuery.isSuccess && posts.length === 0 && (
                        <EmptyState
                            bare
                            className="py-8"
                            description="最近的动态里还没有图片。"
                            descriptionClassName="text-sm"
                        />
                    )}
                    <MediaGrid className="gap-1.5">
                        {posts.flatMap((post) =>
                            pairThumbs(
                                post.images ?? [],
                                post.thumbs ?? [],
                            ).map((image) => {
                                const key = `${post.id}:${image.name}`;
                                const loading = loadingId === key;
                                const thumbUrl = getFileUrl(
                                    post,
                                    image.thumb ?? image.name,
                                    "300x300",
                                );
                                return (
                                    <MediaTile
                                        key={key}
                                        className="rounded-lg"
                                        disabled={loadingId !== null}
                                        media={{
                                            type: "image",
                                            src: thumbUrl,
                                        }}
                                        onOpen={() =>
                                            void pick(post, image.name)
                                        }
                                        openLabel="选择这张图片"
                                        overlay={
                                            loading ? (
                                                <span className="absolute inset-0 grid place-items-center bg-background/60">
                                                    <Loader2 className="size-5 animate-spin text-primary" />
                                                </span>
                                            ) : undefined
                                        }
                                    />
                                );
                            }),
                        )}
                    </MediaGrid>
                </div>
            </SheetContent>
        </Sheet>
    );
}
