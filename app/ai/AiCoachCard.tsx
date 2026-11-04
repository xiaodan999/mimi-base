import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";

import { dayKey } from "@/app/study/engine";
import { gameForModule } from "@/app/study/games/registry";
import { toast } from "@/app/study/toast";
import type { Progress, StudySubject } from "@/app/study/types";

import { useAi } from "./AiContext";
import { readAiCache } from "./cache";
import { AiError, aiErrorText, chatJSON, isAiCanceled } from "./client";
import { planMessages, type AiPlan } from "./prompts";
import { useAiTasks } from "./tasks";

type Props = {
    subject: StudySubject;
    progress: Progress;
};

const SECTIONS = new Set([
    "cards",
    "quiz",
    "exam",
    "terms",
    "wrong",
    "memo",
    "games",
]);

function normalizePlan(
    raw: AiPlan | null | undefined,
    subject: StudySubject,
    minutes: number,
): AiPlan {
    const value = (raw ?? {}) as Partial<AiPlan>;
    const tasks = Array.isArray(value.tasks)
        ? value.tasks
              .slice(0, 5)
              .map((task) => {
                  const section = SECTIONS.has(String(task?.section))
                      ? String(task.section)
                      : "quiz";
                  const moduleId =
                      typeof task?.module === "string" ? task.module : "";
                  return {
                      title: typeof task?.title === "string" ? task.title : "",
                      why: typeof task?.why === "string" ? task.why : "",
                      section,
                      module: subject.modules.some((mod) => mod.id === moduleId)
                          ? moduleId
                          : "",
                  };
              })
              .filter((task) => task.title.trim().length > 0)
        : [];

    return {
        greeting:
            typeof value.greeting === "string"
                ? value.greeting
                : "今天也来一点。",
        focus: typeof value.focus === "string" ? value.focus : "",
        minutes,
        tasks,
        tip: typeof value.tip === "string" ? value.tip : "",
    };
}

export default function AiCoachCard({ subject, progress }: Props) {
    const { settings, configured, openSettings } = useAi();
    const { runTask, cancel, tasks, find, attend } = useAiTasks();
    const [minutes, setMinutes] = useState(20);
    const [plan, setPlan] = useState<AiPlan | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const requestRef = useRef(0);
    const activeKeyRef = useRef<string | null>(null);

    const group = `plan:${subject.id}:${dayKey()}`;
    const cacheKey = `${group}:${minutes}`;

    useEffect(() => {
        setPlan(readAiCache<AiPlan>(cacheKey));
        setError("");
        const task = find(cacheKey);
        setLoading(task?.status === "running");
    }, [cacheKey, find]);

    // 卡片在页面上时，用户看得到计划，不用再弹完成通知
    useEffect(() => {
        return attend(group);
    }, [group, attend]);

    // 从后台回来时，接上还在跑的计划
    const activeTask = tasks.find((task) => task.key === cacheKey);
    useEffect(() => {
        if (!activeTask) return;
        if (activeTask.status === "running") {
            setLoading(true);
            return;
        }
        if (activeTask.status === "done") {
            const cached = readAiCache<AiPlan>(cacheKey);
            if (cached) {
                setPlan(cached);
                setError("");
            }
            setLoading(false);
            return;
        }
        if (activeTask.status === "error") {
            setError(activeTask.error ?? "AI 请求失败");
            setLoading(false);
            return;
        }
        if (activeTask.status === "canceled") {
            setLoading(false);
        }
    }, [activeTask, cacheKey]);

    const generate = useCallback(
        async (nextMinutes: number, force = false) => {
            if (!configured) {
                openSettings();
                toast("先配置一下 AI");
                return;
            }
            const key = `${group}:${nextMinutes}`;
            if (!force) {
                const cached = readAiCache<AiPlan>(key);
                if (cached) {
                    setPlan(cached);
                    setMinutes(nextMinutes);
                    setError("");
                    return;
                }
            }

            if (activeKeyRef.current && activeKeyRef.current !== key) {
                cancel(activeKeyRef.current);
            }
            activeKeyRef.current = key;
            const ticket = ++requestRef.current;
            setLoading(true);
            setError("");
            try {
                const next = await runTask<AiPlan>({
                    key,
                    group,
                    cacheKey: key,
                    title: "AI 学习计划",
                    subtitle: `${subject.title} · ${nextMinutes} 分钟`,
                    kind: "json",
                    force,
                    summarize: (value) => `${value.tasks.length} 个任务`,
                    run: async ({ signal }) => {
                        const raw = await chatJSON<AiPlan>(
                            settings,
                            planMessages(subject, progress, nextMinutes),
                            signal,
                        );
                        const planNext = normalizePlan(
                            raw,
                            subject,
                            nextMinutes,
                        );
                        if (!planNext.tasks.length) {
                            throw new AiError("AI 没排出有效任务，再试一次");
                        }
                        return planNext;
                    },
                });
                if (ticket !== requestRef.current) return;
                setPlan(next);
                setMinutes(nextMinutes);
            } catch (err) {
                if (ticket !== requestRef.current) return;
                if (!isAiCanceled(err)) setError(aiErrorText(err));
            } finally {
                if (ticket === requestRef.current) setLoading(false);
            }
        },
        [
            cancel,
            configured,
            group,
            openSettings,
            progress,
            runTask,
            settings,
            subject,
        ],
    );

    return (
        <div className="st-card">
            <div className="st-between">
                <div>
                    <div className="text-[13px] font-extrabold">
                        🧑‍🏫 AI 学习教练
                    </div>
                    <div className="st-tiny">
                        按你的真实进度，排今天的学习计划
                    </div>
                </div>
                {plan && !loading && (
                    <span className="st-chip b">{plan.minutes} 分钟</span>
                )}
            </div>

            {!plan && !loading && (
                <button
                    className="st-btn sm line mt-3"
                    onClick={() => void generate(minutes)}
                >
                    帮我排今天的计划
                </button>
            )}

            {loading && (
                <div className="mt-3 space-y-2">
                    <div className="st-tiny">正在看你的错题和进度…</div>
                    <div className="ai-skeleton w-2/3" />
                    <div className="ai-skeleton w-full" />
                </div>
            )}

            {error && !loading && (
                <div className="mt-2 text-[12.5px] leading-6 text-amber-800">
                    {error}{" "}
                    <button
                        className="font-bold underline"
                        onClick={() => void generate(minutes, true)}
                    >
                        重试
                    </button>
                </div>
            )}

            {plan && !loading && (
                <>
                    <div className="mt-2 text-[14px] font-extrabold">
                        {plan.greeting}
                    </div>
                    {plan.focus && (
                        <div className="st-tiny mt-1">
                            今天重点：{plan.focus}
                        </div>
                    )}

                    <div className="mt-2 space-y-2">
                        {plan.tasks.map((task, index) => (
                            <Link
                                key={`${task.title}-${index}`}
                                to="/study/$subjectId/$section"
                                params={{
                                    subjectId: subject.id,
                                    section: task.section,
                                }}
                                search={
                                    task.section === "cards" && task.module
                                        ? { m: task.module }
                                        : task.section === "games"
                                          ? {
                                                game: task.module
                                                    ? (gameForModule(
                                                          task.module,
                                                      )?.id ?? "ward-hazard")
                                                    : "ward-hazard",
                                            }
                                          : undefined
                                }
                                className="ai-task"
                            >
                                <span className="ai-task-n">{index + 1}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13.5px] font-bold">
                                        {task.title}
                                    </span>
                                    {task.why && (
                                        <span className="block text-[11.5px] text-muted-foreground">
                                            {task.why}
                                        </span>
                                    )}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                    去 →
                                </span>
                            </Link>
                        ))}
                    </div>

                    {plan.tip && (
                        <div className="st-tiny mt-2">💡 {plan.tip}</div>
                    )}

                    <div className="st-row mt-3" style={{ gap: 8 }}>
                        <button
                            className="st-btn sm ghost"
                            onClick={() => void generate(10)}
                        >
                            只有 10 分钟
                        </button>
                        <button
                            className="st-btn sm ghost"
                            onClick={() => void generate(minutes, true)}
                        >
                            重新排
                        </button>
                    </div>

                    <div className="st-tiny mt-2">
                        AI 生成 · 只缓存在本机 · 点任务直接跳过去
                    </div>
                </>
            )}
        </div>
    );
}
