import { useNavigate } from "@tanstack/react-router";
import {
    AlertCircle,
    Ban,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    CloudOff,
    Copy,
    Loader2,
    RotateCw,
    Sparkles,
    X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import AiMarkdown from "./AiMarkdown";
import AiSheet from "./AiSheet";
import type { AiTask } from "./task-store";
import { formatUsd, readDailyUsage } from "./usage";

type PillProps = {
    running: number;
    unseen: number;
    onOpen: () => void;
};

/** 浮在底部导航上方的入口；发动态的按钮在右侧，这里放左侧。 */
export function AiTaskPill({ running, unseen, onOpen }: PillProps) {
    if (running === 0 && unseen === 0) return null;

    const total = running + unseen;
    const label = running > 0 ? `AI 进行中 · ${total}` : `AI 完成 · ${unseen}`;

    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={`AI 任务：${running} 个进行中，${unseen} 个待查看`}
            className="fixed bottom-[calc(8rem+env(safe-area-inset-bottom))] left-[calc(1rem+env(safe-area-inset-left))] z-40 flex items-center gap-2 rounded-full border border-border/70 bg-card/95 px-3.5 py-2 text-[11.5px] font-bold text-foreground shadow-lg backdrop-blur-sm"
        >
            {running > 0 ? (
                <Loader2
                    className="size-3.5 animate-spin text-primary"
                    aria-hidden="true"
                />
            ) : (
                <Sparkles
                    className="size-3.5 text-primary"
                    aria-hidden="true"
                />
            )}
            <span>{label}</span>
            <span className="sr-only" role="status" aria-live="polite">
                {label}
            </span>
        </button>
    );
}

type CenterProps = {
    tasks: AiTask[];
    open: boolean;
    onClose: () => void;
    onCancel: (id: string) => void;
    onRetry: (id: string) => void;
    onDismiss: (id: string) => void;
    onClearFinished: () => void;
};

export function AiTaskCenter({
    tasks,
    open,
    onClose,
    onCancel,
    onRetry,
    onDismiss,
    onClearFinished,
}: CenterProps) {
    const navigate = useNavigate();
    const [expanded, setExpanded] = useState<string | null>(null);
    const running = tasks.filter((task) => task.status === "running");
    const finished = tasks.filter((task) => task.status !== "running");
    const now = useNow(open && running.length > 0);
    const daily = readDailyUsage();

    const copy = (text: string) => {
        if (!navigator.clipboard) {
            toast.error("复制失败");
            return;
        }
        navigator.clipboard
            .writeText(text)
            .then(() => toast.success("已复制"))
            .catch(() => toast.error("复制失败"));
    };

    return (
        <AiSheet
            open={open}
            onClose={onClose}
            title="AI 任务"
            subtitle="关掉面板也可以继续跑"
            zIndex={86}
        >
            <div className="space-y-3 pb-2">
                {running.length > 0 && (
                    <section>
                        <h3 className="mb-1.5 text-[11px] font-bold tracking-wide text-muted-foreground">
                            进行中
                        </h3>
                        <div className="space-y-2">
                            {running.map((task) => (
                                <div
                                    key={task.id}
                                    className="rounded-2xl border border-border/60 bg-card px-3 py-2.5"
                                >
                                    <div className="flex items-start gap-2">
                                        <Loader2
                                            className="mt-0.5 size-4 shrink-0 animate-spin text-primary"
                                            aria-hidden="true"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-[13.5px] font-bold">
                                                {task.title}
                                            </div>
                                            {task.subtitle && (
                                                <div className="truncate text-[11px] text-muted-foreground">
                                                    {task.subtitle}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => onCancel(task.id)}
                                            className="shrink-0 rounded-full border border-border/70 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
                                        >
                                            取消
                                        </button>
                                    </div>
                                    <p className="mt-2 line-clamp-3 text-[12px] leading-5 whitespace-pre-wrap text-muted-foreground">
                                        {task.text || "正在生成…"}
                                    </p>
                                    <div className="mt-1 text-[10.5px] text-muted-foreground">
                                        已用{" "}
                                        {formatElapsed(now - task.createdAt)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {finished.length > 0 && (
                    <section>
                        <div className="mb-1.5 flex items-center justify-between">
                            <h3 className="text-[11px] font-bold tracking-wide text-muted-foreground">
                                已完成
                            </h3>
                            <button
                                type="button"
                                onClick={onClearFinished}
                                className="text-[11px] font-semibold text-muted-foreground underline"
                            >
                                清空
                            </button>
                        </div>
                        <div className="space-y-2">
                            {finished.map((task) => {
                                const isOpen = expanded === task.id;
                                const hasText =
                                    task.kind !== "json" && Boolean(task.text);
                                const href = task.href;
                                return (
                                    <div
                                        key={task.id}
                                        className="rounded-2xl border border-border/60 bg-card px-3 py-2.5"
                                    >
                                        <div className="flex items-start gap-2">
                                            <StatusIcon status={task.status} />
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-[13.5px] font-bold">
                                                    {task.title}
                                                </div>
                                                {task.subtitle && (
                                                    <div className="truncate text-[11px] text-muted-foreground">
                                                        {task.subtitle}
                                                    </div>
                                                )}
                                                <div className="mt-0.5 text-[11.5px] leading-5 text-muted-foreground">
                                                    {task.status === "error"
                                                        ? task.error
                                                        : task.status ===
                                                            "canceled"
                                                          ? "已取消"
                                                          : task.status ===
                                                              "interrupted"
                                                            ? "上次被中断了"
                                                            : task.summary ||
                                                              "已完成"}
                                                </div>
                                                <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                                                    {timeLabel(
                                                        task.finishedAt ??
                                                            task.createdAt,
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onDismiss(task.id)
                                                }
                                                aria-label="移除这条任务"
                                                className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground"
                                            >
                                                <X
                                                    className="size-3.5"
                                                    aria-hidden="true"
                                                />
                                            </button>
                                        </div>

                                        {hasText && (
                                            <>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setExpanded(
                                                                isOpen
                                                                    ? null
                                                                    : task.id,
                                                            )
                                                        }
                                                        className="flex items-center gap-1 rounded-full border border-border/70 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
                                                    >
                                                        {isOpen ? (
                                                            <ChevronUp
                                                                className="size-3"
                                                                aria-hidden="true"
                                                            />
                                                        ) : (
                                                            <ChevronDown
                                                                className="size-3"
                                                                aria-hidden="true"
                                                            />
                                                        )}
                                                        {isOpen
                                                            ? "收起"
                                                            : "展开全文"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            copy(
                                                                task.text ?? "",
                                                            )
                                                        }
                                                        className="flex items-center gap-1 rounded-full border border-border/70 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
                                                    >
                                                        <Copy
                                                            className="size-3"
                                                            aria-hidden="true"
                                                        />
                                                        复制
                                                    </button>
                                                </div>
                                                {isOpen && (
                                                    <div className="mt-2 rounded-xl bg-muted/60 px-3 py-2">
                                                        <AiMarkdown
                                                            text={
                                                                task.text ?? ""
                                                            }
                                                        />
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {(task.status === "error" ||
                                                (task.status ===
                                                    "interrupted" &&
                                                    task.resumable)) && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        onRetry(task.id)
                                                    }
                                                    className="flex items-center gap-1 rounded-full border border-border/70 px-3 py-1 text-[11px] font-bold text-muted-foreground"
                                                >
                                                    <RotateCw
                                                        className="size-3"
                                                        aria-hidden="true"
                                                    />
                                                    {task.status ===
                                                    "interrupted"
                                                        ? "继续"
                                                        : "重试"}
                                                </button>
                                            )}
                                            {href && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        onClose();
                                                        void navigate({
                                                            to: href,
                                                        });
                                                    }}
                                                    className="rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground"
                                                >
                                                    {task.status ===
                                                        "interrupted" &&
                                                    !task.resumable
                                                        ? "去重跑"
                                                        : "去查看"}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {tasks.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center text-[12.5px] leading-6 text-muted-foreground">
                        还没有 AI 任务。
                        <br />
                        写复盘、批改、排计划时，可以放心去做别的。
                    </div>
                )}

                <p className="st-tiny pt-1 text-center">
                    今日估算消耗 {formatUsd(daily.costUsd)} · {daily.calls} 次 ·{" "}
                    {daily.tokens} tokens
                </p>
                <p className="st-tiny pt-1 text-center">
                    结果只保存在这台设备 · 任务被中断时，能在任务中心继续
                </p>
            </div>
        </AiSheet>
    );
}

function StatusIcon({ status }: { status: AiTask["status"] }) {
    if (status === "done") {
        return (
            <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
            />
        );
    }
    if (status === "error") {
        return (
            <AlertCircle
                className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
            />
        );
    }
    if (status === "interrupted") {
        return (
            <CloudOff
                className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
            />
        );
    }
    return (
        <Ban
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
        />
    );
}

function useNow(active: boolean): number {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!active) return;
        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [active]);

    return now;
}

function formatElapsed(ms: number): string {
    const seconds = Math.max(1, Math.round(ms / 1000));
    if (seconds < 60) return `${seconds} 秒`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} 分钟`;
    return `${Math.floor(minutes / 60)} 小时`;
}

function timeLabel(value: number): string {
    return new Date(value).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
    });
}
