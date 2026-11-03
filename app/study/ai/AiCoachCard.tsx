import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";

import { dayKey } from "../engine";
import { gameForModule } from "../games/registry";
import { toast } from "../toast";
import type { Progress, StudySubject } from "../types";
import { useAi } from "./AiContext";
import { readAiCache, writeAiCache } from "./cache";
import { aiErrorText, chatJSON } from "./client";
import { planMessages, type AiPlan } from "./prompts";

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
    const [minutes, setMinutes] = useState(20);
    const [plan, setPlan] = useState<AiPlan | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const requestRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);

    const cacheKey = `plan:v1:${subject.id}:${dayKey()}:${minutes}`;

    useEffect(() => {
        setPlan(readAiCache<AiPlan>(cacheKey));
        setError("");
    }, [cacheKey]);

    useEffect(() => () => abortRef.current?.abort(), []);

    const generate = useCallback(
        async (nextMinutes: number, force = false) => {
            if (!configured) {
                openSettings();
                toast("先配置一下 AI");
                return;
            }
            const key = `plan:v1:${subject.id}:${dayKey()}:${nextMinutes}`;
            if (!force) {
                const cached = readAiCache<AiPlan>(key);
                if (cached) {
                    setPlan(cached);
                    setMinutes(nextMinutes);
                    setError("");
                    return;
                }
            }

            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            const ticket = ++requestRef.current;
            setLoading(true);
            setError("");
            try {
                const raw = await chatJSON<AiPlan>(
                    settings,
                    planMessages(subject, progress, nextMinutes),
                    controller.signal,
                );
                if (
                    ticket !== requestRef.current ||
                    controller.signal.aborted
                ) {
                    return;
                }
                const next = normalizePlan(raw, subject, nextMinutes);
                if (!next.tasks.length) {
                    setError("AI 没排出有效任务，再试一次");
                    return;
                }
                writeAiCache(key, next);
                setPlan(next);
                setMinutes(nextMinutes);
            } catch (err) {
                if (controller.signal.aborted) return;
                setError(aiErrorText(err));
            } finally {
                if (ticket === requestRef.current) setLoading(false);
            }
        },
        [configured, openSettings, progress, settings, subject],
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
