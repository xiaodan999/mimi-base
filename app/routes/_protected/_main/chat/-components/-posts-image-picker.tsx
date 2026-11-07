import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { imageToDataUrl } from "@/app/ai/image";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { useCurrentUser } from "@/lib/auth";
import pb, { ensureFileToken, getFileUrl } from "@/lib/pb";
import { pairThumbs } from "@/lib/photoFiles";
import { qk } from "@/lib/query-keys";

type PostImagesRecord = {
    id: string;
    collectionId?: string;
    collectionName?: string;
    text?: string;
    images?: string[];
    thumbs?: string[];
    created: string;
};

/** Fetch recent posts and keep only the ones with images. */
export async function fetchRecentPostsWithImages(
    signal?: AbortSignal,
): Promise<PostImagesRecord[]> {
    await ensureFileToken();
    const rows = await pb.collection("posts").getList<PostImagesRecord>(1, 40, {
        sort: "-created",
        fields: "id,collectionId,text,images,thumbs,created",
        requestKey: signal ? undefined : null,
    });
    return rows.items.filter((row) => (row.images?.length ?? 0) > 0);
}

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
    const user = useCurrentUser();
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const postsQuery = useQuery({
        queryKey: qk.posts.list(user.id, "with-images"),
        queryFn: ({ signal }) => fetchRecentPostsWithImages(signal),
        enabled: open,
        staleTime: 60_000,
    });
    const posts = useMemo(() => postsQuery.data ?? [], [postsQuery.data]);

    const pick = async (post: PostImagesRecord, filename: string) => {
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
                className="flex max-h-[70dvh] flex-col gap-2 px-4 pb-6"
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
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            最近的动态里还没有图片。
                        </p>
                    )}
                    <div className="grid grid-cols-3 gap-1.5">
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
                                    <button
                                        key={key}
                                        type="button"
                                        aria-label="选择这张图片"
                                        disabled={loadingId !== null}
                                        onClick={() =>
                                            void pick(post, image.name)
                                        }
                                        className="relative aspect-square overflow-hidden rounded-lg border border-border/60 bg-muted"
                                    >
                                        <img
                                            src={thumbUrl}
                                            alt="动态图片"
                                            loading="lazy"
                                            className="size-full object-cover"
                                        />
                                        {loading && (
                                            <span className="absolute inset-0 grid place-items-center bg-background/60">
                                                <Loader2 className="size-5 animate-spin text-primary" />
                                            </span>
                                        )}
                                    </button>
                                );
                            }),
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
