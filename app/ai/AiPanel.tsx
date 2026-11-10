import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "@/app/study/toast";

import { useAi } from "./AiContext";
import AiMarkdown from "./AiMarkdown";
import AiSheet from "./AiSheet";
import { hashText, readAiCache } from "./cache";
import {
    aiErrorText,
    type AiMessage,
    isAiCanceled,
    streamChat,
} from "./client";
import { decideAiRestore } from "./restore";
import type { AiTaskHref } from "./task-store";
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
    /** 完成后「去查看」要回到哪个页面；默认学习页，账单点评会传 /jizhang */
    href?: AiTaskHref;
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
    href = "/study",
}: Props) {
    const { settings, openSettings } = useAi();
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
                    href,
                    kind: "stream",
                    force: options?.force,
                    summarize: () => "AI 回复已生成",
                    // 记入中断台账：页面被杀后任务中心能原样续跑这一问
                    resume: { messages: requestMessages, history },
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
        [cacheKey, cancel, href, runTask, settings, subtitle, title],
    );

    // biome-ignore lint/correctness/useExhaustiveDependencies: 故意只在列出的依赖上重建
    useEffect(() => {
        if (!open) {
            startedRef.current = null;
            return;
        }
        if (startedRef.current === cacheKey) return;
        startedRef.current = cacheKey;

        // 统一决策：running 优先，再 local → store result → cache；失败时好缓存
        // 仍然优先于 error（restore.test.ts 保护的就是这种情况）。
        const decision = decideAiRestore<AiTurn[]>({
            task: find(cacheKey),
            local: turnsRef.current,
            result: getResult<AiTurn[]>(cacheKey),
            cached: readAiCache<AiTurn[]>(cacheKey),
            hasValue: (value) => value.length > 0,
        });
        switch (decision.kind) {
            case "ready":
                turnsRef.current = decision.value;
                setTurns(decision.value);
                setError("");
                setStreaming(false);
                return;
            case "error":
                setError(decision.message);
                setStreaming(false);
                return;
            case "canceled":
                setError("已取消");
                setStreaming(false);
                return;
            case "running":
            case "none":
                // running：run() 会接上同一个任务；none：开一个新的
                setTurns([]);
                void run(messages, []);
                return;
        }
    }, [open, cacheKey]);

    // 后台任务（包括追问）还在跑时，重新打开面板也能看到进度
    const activeTask = tasks.find((task) => task.cacheKey === cacheKey);
    useEffect(() => {
        if (!open || !activeTask) return;
        if (localRunRef.current === activeTask.key) return;

        if (activeTask.status === "running") {
            // 运行中的任务：把已流出的文本接上（实时进度，不是恢复决策）
            const base = readAiCache<AiTurn[]>(cacheKey) ?? [];
            setTurns([
                ...base,
                { role: "assistant", content: activeTask.text ?? "" },
            ]);
            setError("");
            setStreaming(true);
            return;
        }

        const decision = decideAiRestore<AiTurn[]>({
            task: activeTask,
            result: getResult<AiTurn[]>(cacheKey),
            cached: readAiCache<AiTurn[]>(cacheKey),
            hasValue: (value) => value.length > 0,
        });
        if (decision.kind === "ready") {
            turnsRef.current = decision.value;
            setTurns(decision.value);
            setError("");
            setStreaming(false);
            return;
        }
        if (decision.kind === "error") {
            setError(decision.message);
            setStreaming(false);
            return;
        }
        setStreaming(false);
        if (decision.kind === "canceled" && !activeTask.text) {
            setError("已取消");
        }
    }, [open, cacheKey, activeTask, getResult]);

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
        void run(messages, [], { force: true });
    }, [messages, run]);

    const askChip = (chip: AiChip) => {
        if (streaming) return;
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
