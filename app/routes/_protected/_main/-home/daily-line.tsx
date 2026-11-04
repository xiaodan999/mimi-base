import { useEffect, useMemo, useState } from "react";

import { useAi } from "@/app/ai/AiContext";
import { readAiCache, writeAiCache, hashText } from "@/app/ai/cache";
import { chatText } from "@/app/ai/client";
import { dailyLineMessages } from "@/app/ai/home";
import { useCurrentUser } from "@/lib/auth";
import { getDateString } from "@/lib/date";

import type { HomeStats } from "../-home-data";

const FALLBACK = "今天也来记录一点什么吧。";

/**
 * The greeting line under the name. One request per day (plus a new one when
 * today's numbers change); the last generated line is cached locally.
 */
export default function DailyLine({
    greeting,
    stats,
    streak,
}: {
    greeting: string;
    stats: HomeStats | undefined;
    streak: number;
}) {
    const user = useCurrentUser();
    const { settings, configured } = useAi();
    const [line, setLine] = useState("");

    const key = useMemo(
        () =>
            [
                "daily",
                user.id,
                getDateString(new Date()),
                hashText(JSON.stringify(stats ?? null) + streak),
            ].join(":"),
        [user.id, stats, streak],
    );

    useEffect(() => {
        if (!configured) {
            setLine("");
            return;
        }

        const cached = readAiCache<string>(key);
        if (cached) {
            setLine(cached);
            return;
        }
        if (!stats) return;

        const controller = new AbortController();
        setLine("");
        chatText(
            settings,
            dailyLineMessages({
                greeting,
                postsToday: stats.postsToday,
                monthSpend: stats.monthSpend,
                monthEntries: stats.monthEntries,
                streak,
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
                // 生成失败就保持默认文案，首页不该因为 AI 报错变样。
            });

        return () => controller.abort();
    }, [key, configured, settings, stats, greeting, streak]);

    return (
        <p className="mt-3 text-sm text-muted-foreground">{line || FALLBACK}</p>
    );
}
