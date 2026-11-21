import type { TopPost } from "@/app/report/data";
import { getFileUrl } from "@/lib/pb";

export default function TopPostRow({ post }: { post: TopPost }) {
    const url = post.image
        ? getFileUrl(
              {
                  id: post.id,
                  collectionId: post.collectionId,
                  collectionName: post.collectionName,
              },
              post.image,
              "400x400",
          )
        : "";

    return (
        <li className="flex items-center gap-3">
            {url ? (
                <img
                    src={url}
                    alt=""
                    className="size-14 shrink-0 rounded-xl object-cover"
                    loading="lazy"
                />
            ) : (
                <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-muted text-[10px] text-muted-foreground">
                    记录
                </span>
            )}
            <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-xs leading-5">
                    {post.text.trim() || "只有照片的一条动态"}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {post.createdAt.slice(0, 10)} · {post.likes} 赞
                </p>
            </div>
        </li>
    );
}
