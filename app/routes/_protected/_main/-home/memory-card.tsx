import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns/esm";
import { History } from "lucide-react";

import { useAi } from "@/app/ai/AiContext";
import { hashText, readAiCache, writeAiCache } from "@/app/ai/cache";
import { chatText } from "@/app/ai/client";
import { memoryMessages } from "@/app/ai/home";
import { useCurrentUser } from "@/lib/auth";
import { getDateString } from "@/lib/date";
import { getFileUrl } from "@/lib/pb";

import { useOnThisDay, type MemoryPost } from "../-home-data";

export default function MemoryCard() {
    const user = useCurrentUser();
    const { settings, configured } = useAi();
    const { data } = useOnThisDay();
    const [line, setLine] = useState("");

    const key = useMemo(() => {
        if (!data?.length) return "";
        return [
            "memory",
            user.id,
            getDateString(new Date()),
            hashText(data.map((post) => post.id).join(",")),
        ].join(":");
    }, [data, user.id]);

    useEffect(() => {
        if (!configured || !key || !data?.length) {
            setLine("");
            return;
        }
        const cached = readAiCache<string>(key);
        if (cached) {
            setLine(cached);
            return;
        }

        const controller = new AbortController();
        chatText(
            settings,
            memoryMessages({
                dateLabel: format(new Date(), "M月d日"),
                texts: data
                    .filter((post) => post.text.trim())
                    .map((post) => ({
                        yearsAgo: post.yearsAgo,
                        text: post.text,
                    })),
            }),
            controller.signal,
        )
            .then((text) => {
                const value = text.trim();
                if (!value || controller.signal.aborted) return;
                writeAiCache(key, value);
                setLine(value);
            })
            .catch(() => {
                // 回忆卡没有旁白也能用。
            });

        return () => controller.abort();
    }, [configured, key, settings, data]);

    if (!data?.length) return null;

    const photos = data.filter((post) => post.image).slice(0, 3);

    return (
        <section className="mt-4 rounded-2xl border border-border/60 bg-card p-4 shadow-soft">
            <div className="flex items-center gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <History className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">去年今天</p>
                    <p className="text-[11px] text-muted-foreground">
                        往年的今天，你留下过 {data.length} 条记录
                    </p>
                </div>
            </div>

            {photos.length > 0 && (
                <div className="mt-3 flex gap-2">
                    {photos.map((post) => (
                        <MemoryImage key={post.id} post={post} />
                    ))}
                </div>
            )}

            <p className="mt-3 line-clamp-3 text-sm leading-6 text-foreground/90">
                {firstText(data)}
            </p>

            {line && (
                <p className="mt-2 border-l-2 border-primary/30 pl-2 text-[12px] leading-5 text-muted-foreground">
                    {line}
                </p>
            )}
        </section>
    );
}

function firstText(posts: MemoryPost[]): string {
    const text = posts.find((post) => post.text.trim())?.text.trim() ?? "";
    return text || "那天没有写什么，只有照片。";
}

function MemoryImage({ post }: { post: MemoryPost }) {
    const url = getFileUrl(
        {
            id: post.id,
            collectionId: post.collectionId,
            collectionName: post.collectionName,
        },
        post.image,
        "400x400",
    );
    if (!url) return null;

    return (
        <img
            src={url}
            alt={`${post.yearsAgo} 年前的照片`}
            className="size-20 shrink-0 rounded-xl object-cover"
            loading="lazy"
        />
    );
}
