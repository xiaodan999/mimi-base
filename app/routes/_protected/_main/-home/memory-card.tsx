import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns/esm";
import { History } from "lucide-react";

import { useAi } from "@/app/ai/AiContext";
import { hashText, readAiCache } from "@/app/ai/cache";
import { AiError, chatText } from "@/app/ai/client";
import { memoryMessages } from "@/app/ai/home";
import { decideAiRestore } from "@/app/ai/restore";
import { useAiTasks } from "@/app/ai/tasks";
import { useCurrentUser } from "@/lib/auth";
import { getDateString } from "@/lib/date";
import { getFileUrl } from "@/lib/pb";

import { useOnThisDay, type MemoryPost } from "../-home-data";

export default function MemoryCard() {
    const user = useCurrentUser();
    const { settings } = useAi();
    const { runTask, find, getResult, attend } = useAiTasks();
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
    const group = `memory:${user.id}`;

    useEffect(() => {
        if (!key || !data?.length) {
            setLine("");
            return;
        }
        const decision = decideAiRestore<string>({
            task: find(key),
            result: getResult<string>(key),
            cached: readAiCache<string>(key),
            hasValue: (value) => value.trim().length > 0,
        });
        if (decision.kind === "ready") {
            setLine(decision.value);
            return;
        }
        // 失败 / 取消：回忆卡没有旁白也能用
        if (decision.kind === "error" || decision.kind === "canceled") return;

        // running / none：runTask 后台跑，不再自己 abort
        const messages = memoryMessages({
            dateLabel: format(new Date(), "M月d日"),
            texts: data
                .filter((post) => post.text.trim())
                .map((post) => ({
                    yearsAgo: post.yearsAgo,
                    text: post.text,
                })),
        });
        void runTask<string>({
            key,
            group,
            cacheKey: key,
            title: "去年今天",
            href: "/home",
            kind: "text",
            resume: { messages },
            run: async ({ signal }) => {
                const text = await chatText(settings, messages, signal);
                const value = text.trim();
                if (!value) throw new AiError("AI 没写出内容");
                return value;
            },
        })
            .then((value) => setLine(value))
            .catch(() => {
                // 回忆卡没有旁白也能用
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, settings, data]);

    useEffect(() => {
        return attend(group);
    }, [group, attend]);

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
    return text || "那天没有写什么，只留下了照片或视频。";
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
