import { useEffect, useMemo, useState } from "react";

import { useAi } from "@/app/ai/AiContext";
import { hashText, readAiCache } from "@/app/ai/cache";
import { AiError, chatText } from "@/app/ai/client";
import { dailyLineMessages } from "@/app/ai/home";
import { decideAiRestore } from "@/app/ai/restore";
import { useAiTasks } from "@/app/ai/tasks";
import { useCurrentUser } from "@/lib/auth";
import { getDateString } from "@/lib/date";

import type { HomeStats } from "../-home-data";

const FALLBACK = "今天也来记录一点什么吧。";

/**
 * The greeting line under the name. One request per day (plus a new one when
 * today's numbers change); the last generated line is cached locally.
 * 生成走 app 级 runTask，关掉页面/切走也不会被 abort；重新进入用
 * decideAiRestore 接回缓存或后台结果。
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
    const { settings } = useAi();
    const { runTask, find, getResult, attend } = useAiTasks();
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
    const group = `daily:${user.id}`;

    useEffect(() => {
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
        // 失败 / 取消就保持默认文案；首页不该因为 AI 报错变样。
        if (decision.kind === "error" || decision.kind === "canceled") return;
        if (!stats) return;

        // running / none：runTask 会接上同 key 的后台任务或开一个新的，
        // 不再自己建 AbortController、也不在 unmount 时 abort。
        void runTask<string>({
            key,
            group,
            cacheKey: key,
            title: "今日小结",
            href: "/home",
            kind: "text",
            run: async ({ signal }) => {
                const text = await chatText(
                    settings,
                    dailyLineMessages({
                        greeting,
                        postsToday: stats.postsToday,
                        monthSpend: stats.monthSpend,
                        monthEntries: stats.monthEntries,
                        streak,
                    }),
                    signal,
                );
                const value = text.trim();
                if (!value) throw new AiError("AI 没写出内容");
                return value;
            },
        })
            .then((value) => setLine(value))
            .catch(() => {
                // 生成失败就保持默认文案
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, settings, stats, greeting, streak]);

    // 卡片在首页上时，完成通知是多余的
    useEffect(() => {
        return attend(group);
    }, [group, attend]);

    return (
        <p className="mt-3 text-sm text-muted-foreground">{line || FALLBACK}</p>
    );
}
