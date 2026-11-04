import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "@/app/study/toast";

import { useAi } from "./AiContext";
import AiMarkdown from "./AiMarkdown";
import AiSheet from "./AiSheet";
import { hashText, readAiCache } from "./cache";
import {
    aiErrorText,
    isAiCanceled,
    streamChat,
    type AiMessage,
} from "./client";
import { useAiTasks } from "./tasks";

export type AiTurn = { role: "user" | "assistant"; content: string };

export type AiChip = { label: string; prompt: string };

type Props = {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    cacheKey: string;
    messages: AiMessage[];
    chips?: AiChip[];
    intro?: string;
};

type RunOptions = { key?: string; force?: boolean };

/**
 * 通用流式对话面板：
 * - 首次打开自动请求并缓存到本机
 * - 关掉面板不会中止请求，任务在 App 层继续跑
 * - 支持追问 chip、重新生成、复制
 */
export default function AiPanel({
    open,
    onClose,
    title,
    subtitle,
    cacheKey,
    messages,
    chips,
    intro,
}: Props) {
    const { settings, configured, openSettings } = useAi();
    const { runTask, cancel, attend, tasks, find, getResult } = useAiTasks();
    const [turns, setTurns] = useState<AiTurn[]>([]);
    const [streaming, setStreaming] = useState(false);
    const [error, setError] = useState("");
    const startedRef = useRef<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const turnsRef = useRef<AiTurn[]>([]);
    const activeKeyRef = useRef<string | null>(null);
    const localRunRef = useRef<string | null>(null);
    const runTicketRef = useRef(0);

    const run = useCallback(
        async (base: AiMessage[], history: AiTurn[], options?: RunOptions) => {
            const key = options?.key ?? cacheKey;
            if (activeKeyRef.current && activeKeyRef.current !== key) {
                cancel(activeKeyRef.current);
            }
            activeKeyRef.current = key;
            localRunRef.current = key;
            const ticket = ++runTicketRef.current;

            setError("");
            setStreaming(true);
            setTurns([...history, { role: "assistant", content: "" }]);

            const requestMessages: AiMessage[] = [
                ...base,
                ...history.map((turn) => ({
                    role: turn.role,
                    content: turn.content,
                })),
            ];
            let text = "";

            try {
                const finalTurns = await runTask<AiTurn[]>({
                    key,
                    group: cacheKey,
                    cacheKey,
                    title,
                    subtitle,
                    kind: "stream",
                    force: options?.force,
                    summarize: () => "AI 回复已生成",
                    run: async ({ signal, report }) => {
                        for await (const delta of streamChat(
                            settings,
                            requestMessages,
                            signal,
                        )) {
                            text += delta;
                            report(text);
                            if (runTicketRef.current !== ticket) break;
                            setTurns((previous) => {
                                const next = previous.slice();
                                next[next.length - 1] = {
                                    role: "assistant",
                                    content: text,
                                };
                                return next;
                            });
                        }
                        return [
                            ...history,
                            { role: "assistant", content: text },
                        ];
                    },
                });

                if (runTicketRef.current !== ticket) return;
                turnsRef.current = finalTurns;
                setTurns(finalTurns);
            } catch (err) {
                if (runTicketRef.current !== ticket) return;
                if (isAiCanceled(err)) {
                    // 保留已经流出来的部分，不把「取消」当成报错
                    if (!text) {
                        turnsRef.current = history;
                        setTurns(history);
                    }
                    return;
                }
                setError(aiErrorText(err));
                turnsRef.current = history;
                setTurns(history);
            } finally {
                if (runTicketRef.current === ticket) {
                    if (localRunRef.current === key) {
                        localRunRef.current = null;
                    }
                    setStreaming(false);
                }
            }
        },
        [cacheKey, cancel, runTask, settings, subtitle, title],
    );

    useEffect(() => {
        if (!open) {
            startedRef.current = null;
            return;
        }
        if (!configured) {
            startedRef.current = null;
            setTurns([]);
            setError("先点设置，填一下 API Key 和模型。");
            return;
        }
        if (startedRef.current === cacheKey) return;
        startedRef.current = cacheKey;

        const cached = readAiCache<AiTurn[]>(cacheKey);
        if (cached?.length) {
            turnsRef.current = cached;
            setTurns(cached);
            setError("");
            setStreaming(false);
            return;
        }

        // 回到面板时，任务可能还在后台跑，或者刚刚跑完
        const task = find(cacheKey);
        if (task) {
            if (task.status === "running") {
                setTurns([{ role: "assistant", content: task.text ?? "" }]);
                setError("");
                setStreaming(true);
                return;
            }
            if (task.status === "done") {
                const result = getResult<AiTurn[]>(cacheKey);
                if (result?.length) {
                    turnsRef.current = result;
                    setTurns(result);
                    setError("");
                    setStreaming(false);
                    return;
                }
            }
            if (task.status === "error") {
                setError(task.error ?? "AI 请求失败");
                setStreaming(false);
                return;
            }
            if (task.status === "canceled") {
                setError("已取消");
                setStreaming(false);
                return;
            }
        }

        void run(messages, []);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, cacheKey, configured]);

    // 后台任务（包括追问）还在跑时，重新打开面板也能看到进度
    const activeTask = tasks.find((task) => task.cacheKey === cacheKey);
    useEffect(() => {
        if (!open || !activeTask) return;
        if (localRunRef.current === activeTask.key) return;

        if (activeTask.status === "running") {
            const base = readAiCache<AiTurn[]>(cacheKey) ?? [];
            setTurns([
                ...base,
                { role: "assistant", content: activeTask.text ?? "" },
            ]);
            setError("");
            setStreaming(true);
            return;
        }
        if (activeTask.status === "done") {
            const cached = readAiCache<AiTurn[]>(cacheKey);
            if (cached?.length) {
                turnsRef.current = cached;
                setTurns(cached);
            }
            setStreaming(false);
            return;
        }
        if (activeTask.status === "error") {
            setStreaming(false);
            setError(activeTask.error ?? "AI 请求失败");
            return;
        }
        if (activeTask.status === "canceled") {
            setStreaming(false);
            if (!activeTask.text) setError("已取消");
        }
    }, [open, cacheKey, activeTask]);

    // 面板开着时任务完成不用再弹通知
    useEffect(() => {
        if (!open) return;
        return attend(cacheKey);
    }, [open, cacheKey, attend]);

    useEffect(() => {
        turnsRef.current = turns;
    }, [turns]);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [turns, streaming]);

    const regenerate = useCallback(() => {
        if (!configured) {
            openSettings();
            return;
        }
        void run(messages, [], { force: true });
    }, [configured, messages, openSettings, run]);

    const askChip = (chip: AiChip) => {
        if (streaming) return;
        if (!configured) {
            openSettings();
            return;
        }
        const history = turnsRef.current;
        void run(
            messages,
            [...history, { role: "user", content: chip.prompt }],
            {
                key: `${cacheKey}:ask:${hashText(
                    chip.prompt + history.length,
                )}`,
            },
        );
    };

    const copy = () => {
        const text = turns
            .map((turn) => turn.content)
            .join("\n\n")
            .trim();
        if (!text) return;
        if (!navigator.clipboard) {
            toast("复制失败");
            return;
        }
        navigator.clipboard
            .writeText(text)
            .then(() => toast("已复制"))
            .catch(() => toast("复制失败"));
    };

    return (
        <AiSheet
            open={open}
            onClose={onClose}
            title={title}
            subtitle={subtitle}
            bodyRef={scrollRef}
        >
            <div className="space-y-3">
                {intro && <div className="st-tiny">{intro}</div>}

                {turns.map((turn, index) =>
                    turn.role === "user" ? (
                        <div key={index} className="flex justify-end">
                            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-[13.5px] text-primary-foreground">
                                {turn.content}
                            </div>
                        </div>
                    ) : (
                        <div
                            key={index}
                            className="rounded-2xl rounded-bl-md bg-muted/60 px-3 py-2"
                        >
                            <AiMarkdown text={turn.content || "…"} />
                        </div>
                    ),
                )}

                {streaming && (
                    <div className="flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
                        <span>AI 正在想… 可以关掉，后台会继续跑</span>
                        {activeTask?.status === "running" && (
                            <button
                                className="st-btn sm ghost"
                                onClick={() => cancel(activeTask.id)}
                            >
                                取消
                            </button>
                        )}
                    </div>
                )}

                {error && (
                    <div className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-6 text-amber-800">
                        {error}
                        <div className="mt-2 flex flex-wrap gap-2">
                            <button
                                className="st-btn sm line"
                                onClick={regenerate}
                            >
                                重试
                            </button>
                            <button
                                className="st-btn sm ghost"
                                onClick={openSettings}
                            >
                                打开设置
                            </button>
                        </div>
                    </div>
                )}

                {!streaming && !error && turns.length > 0 && (
                    <div className="st-row flex-wrap" style={{ gap: 8 }}>
                        <button
                            className="st-btn sm ghost"
                            onClick={regenerate}
                        >
                            重新生成
                        </button>
                        <button className="st-btn sm ghost" onClick={copy}>
                            复制
                        </button>
                    </div>
                )}

                {!streaming && !error && chips?.length ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                        {chips.map((chip) => (
                            <button
                                key={chip.label}
                                className="st-chip b"
                                onClick={() => askChip(chip)}
                            >
                                {chip.label}
                            </button>
                        ))}
                    </div>
                ) : null}

                <div className="st-tiny pt-2 text-center">
                    AI 生成，仅供参考 · 内容只缓存在本机
                </div>
            </div>
        </AiSheet>
    );
}
