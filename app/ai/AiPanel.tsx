import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "@/app/study/toast";

import { useAi } from "./AiContext";
import AiMarkdown from "./AiMarkdown";
import AiSheet from "./AiSheet";
import { readAiCache, writeAiCache } from "./cache";
import { aiErrorText, streamChat, type AiMessage } from "./client";

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

/**
 * 通用流式对话面板：
 * - 首次打开自动请求并缓存到本机
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
    const [turns, setTurns] = useState<AiTurn[]>([]);
    const [streaming, setStreaming] = useState(false);
    const [error, setError] = useState("");
    const abortRef = useRef<AbortController | null>(null);
    const startedRef = useRef<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const turnsRef = useRef<AiTurn[]>([]);

    const stop = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
    }, []);

    const run = useCallback(
        async (base: AiMessage[], history: AiTurn[]) => {
            stop();
            const controller = new AbortController();
            abortRef.current = controller;
            setError("");
            setStreaming(true);
            setTurns([...history, { role: "assistant", content: "" }]);

            let text = "";
            try {
                const requestMessages: AiMessage[] = [
                    ...base,
                    ...history.map((turn) => ({
                        role: turn.role,
                        content: turn.content,
                    })),
                ];
                for await (const delta of streamChat(
                    settings,
                    requestMessages,
                    controller.signal,
                )) {
                    text += delta;
                    setTurns((prev) => {
                        const next = prev.slice();
                        next[next.length - 1] = {
                            role: "assistant",
                            content: text,
                        };
                        return next;
                    });
                }
                const finalTurns: AiTurn[] = [
                    ...history,
                    { role: "assistant", content: text },
                ];
                turnsRef.current = finalTurns;
                setTurns(finalTurns);
                writeAiCache(cacheKey, finalTurns);
            } catch (err) {
                if (controller.signal.aborted) return;
                setError(aiErrorText(err));
                turnsRef.current = history;
                setTurns(history);
            } finally {
                if (abortRef.current === controller) abortRef.current = null;
                setStreaming(false);
            }
        },
        [cacheKey, settings, stop],
    );

    useEffect(() => {
        if (!open) {
            stop();
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
        void run(messages, []);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, cacheKey, configured]);

    useEffect(() => {
        turnsRef.current = turns;
    }, [turns]);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [turns, streaming]);

    useEffect(() => () => stop(), [stop]);

    const regenerate = useCallback(() => {
        if (!configured) {
            openSettings();
            return;
        }
        void run(messages, []);
    }, [configured, messages, openSettings, run]);

    const askChip = (chip: AiChip) => {
        if (streaming) return;
        if (!configured) {
            openSettings();
            return;
        }
        const history = turnsRef.current;
        void run(messages, [
            ...history,
            { role: "user", content: chip.prompt },
        ]);
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

                {streaming && <div className="st-tiny">AI 正在想…</div>}

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
