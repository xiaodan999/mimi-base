import { useCallback, useEffect, useState } from "react";

import { useAi } from "@/app/ai/AiContext";
import AiSheet from "@/app/ai/AiSheet";
import { readAiCache } from "@/app/ai/cache";
import { AiError, aiErrorText, chatJSON, isAiCanceled } from "@/app/ai/client";
import { decideAiRestore } from "@/app/ai/restore";
import { type DrillCandidate, drillPickMessages } from "@/app/ai/study";
import { useAiTasks } from "@/app/ai/tasks";

import { dayKey, shuffle } from "../engine";
import type { Progress, QuizItem, StudySubject } from "../types";
import { useStudy } from "./StudyContext";

const PICK_COUNT = 8;
const CANDIDATE_LIMIT = 40;

type DrillResponse = {
    ids?: unknown;
    reason?: unknown;
};

type DrillResult = {
    ids: string[];
    reason: string;
};

function moduleName(subject: StudySubject, id: string): string {
    return subject.modules.find((mod) => mod.id === id)?.name ?? id;
}

/** 每个模块错了多少题，用来决定候选池的顺序。 */
function moduleWrongCounts(
    subject: StudySubject,
    progress: Progress,
): { id: string; name: string; wrong: number }[] {
    const counts = new Map<string, number>();
    for (const id of Object.keys(progress.wrong)) {
        const item = subject.bank.find((entry) => entry.id === id);
        if (!item) continue;
        counts.set(item.m, (counts.get(item.m) ?? 0) + 1);
    }
    return subject.modules
        .map((mod) => ({
            id: mod.id,
            name: mod.name,
            wrong: counts.get(mod.id) ?? 0,
        }))
        .sort((a, b) => b.wrong - a.wrong);
}

export default function AiDrillSheet({
    open,
    onClose,
    onStart,
}: {
    open: boolean;
    onClose: () => void;
    onStart: (items: QuizItem[]) => void;
}) {
    const { subject, progress } = useStudy();
    const { settings } = useAi();
    const { runTask, find, getResult, attend } = useAiTasks();
    const [items, setItems] = useState<QuizItem[]>([]);
    const [reason, setReason] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [fallbackIds, setFallbackIds] = useState<string[]>([]);

    const cacheKey = `drill:v1:${subject.id}:${dayKey()}`;

    const buildCandidates = useCallback((): {
        candidates: QuizItem[];
        weakModules: string[];
    } => {
        const moduleStats = moduleWrongCounts(subject, progress);
        const weak = moduleStats.filter((mod) => mod.wrong > 0);
        const targets = (weak.length > 0 ? weak : moduleStats).slice(0, 3);
        const weakIds = new Set(targets.map((mod) => mod.id));

        const pool = subject.bank.filter((item) => weakIds.has(item.m));
        const wrongIds = new Set(Object.keys(progress.wrong));
        // 先放没做错过的题，避免这组练习全是刚看过的原题。
        const fresh = shuffle(pool.filter((item) => !wrongIds.has(item.id)));
        const retry = shuffle(pool.filter((item) => wrongIds.has(item.id)));

        return {
            candidates: [...fresh, ...retry].slice(0, CANDIDATE_LIMIT),
            weakModules: targets.map((mod) => mod.name),
        };
    }, [progress, subject]);

    const fallback = useCallback((pool: QuizItem[]) => {
        const picked = shuffle(pool).slice(0, PICK_COUNT);
        setItems(picked);
        setFallbackIds(picked.map((item) => item.id));
        setReason("随机挑了一组覆盖弱项的题。");
        setError("AI 这次没挑出来，先用随机的一组。");
    }, []);

    const pick = useCallback(
        async (force = false) => {
            const { candidates, weakModules } = buildCandidates();
            if (candidates.length === 0) {
                setError("题库里还没有可练的题。");
                return;
            }

            setLoading(true);
            setError("");
            if (force) {
                setItems([]);
                setReason("");
                setFallbackIds([]);
            }
            try {
                const result = await runTask<DrillResult>({
                    key: cacheKey,
                    group: cacheKey,
                    cacheKey,
                    title: "定向刷题",
                    subtitle: "按错题分布挑一组",
                    href: "/study",
                    kind: "json",
                    force,
                    summarize: (value) => `已挑 ${value.ids.length} 道题`,
                    run: async ({ signal }) => {
                        const response = await chatJSON<DrillResponse>(
                            settings,
                            drillPickMessages({
                                subjectTitle: subject.title,
                                weakModules:
                                    weakModules.length > 0
                                        ? weakModules
                                        : ["全部模块"],
                                candidates: candidates.map(
                                    (item): DrillCandidate => ({
                                        id: item.id,
                                        moduleName: moduleName(subject, item.m),
                                        stem: item.stem,
                                    }),
                                ),
                            }),
                            signal,
                        );

                        const allowed = new Set(
                            candidates.map((item) => item.id),
                        );
                        const ids = Array.isArray(response.ids)
                            ? response.ids.filter(
                                  (id): id is string =>
                                      typeof id === "string" && allowed.has(id),
                              )
                            : [];
                        if (ids.length === 0) {
                            throw new AiError(
                                "AI 这次没挑出来，先用随机的一组。",
                            );
                        }

                        return {
                            ids,
                            reason:
                                typeof response.reason === "string"
                                    ? response.reason.trim()
                                    : "",
                        };
                    },
                });

                const byId = new Map(candidates.map((item) => [item.id, item]));
                const picked = result.ids.flatMap((id) => {
                    const item = byId.get(id);
                    return item ? [item] : [];
                });
                if (picked.length === 0) {
                    fallback(candidates);
                    return;
                }
                setItems(picked.slice(0, PICK_COUNT));
                setReason(result.reason);
                setFallbackIds([]);
            } catch (err) {
                if (isAiCanceled(err)) return;
                setError(aiErrorText(err));
                fallback(candidates);
            } finally {
                setLoading(false);
            }
        },
        [buildCandidates, cacheKey, fallback, runTask, settings, subject],
    );

    // 打开时用统一决策接上后台任务 / 缓存结果（running 优先，再结果→缓存）。
    // biome-ignore lint/correctness/useExhaustiveDependencies: 故意只在列出的依赖上重建
    useEffect(() => {
        if (!open) return;
        const byId = new Map(subject.bank.map((item) => [item.id, item]));
        const toItems = (result: DrillResult) =>
            result.ids.flatMap((id) => {
                const item = byId.get(id);
                return item ? [item] : [];
            });

        const decision = decideAiRestore<DrillResult>({
            task: find(cacheKey),
            result: getResult<DrillResult>(cacheKey),
            cached: readAiCache<DrillResult>(cacheKey),
            hasValue: (value) => toItems(value).length > 0,
        });
        if (decision.kind === "ready") {
            setItems(toItems(decision.value).slice(0, PICK_COUNT));
            setReason(decision.value.reason);
            setError("");
            setFallbackIds([]);
            setLoading(false);
            return;
        }
        if (decision.kind === "canceled") {
            setLoading(false);
            setError("已取消");
            return;
        }
        if (decision.kind === "error") {
            setLoading(false);
            setError(decision.message);
            return;
        }
        // running：pick() 会接上同一个任务；none：开一个新的
        void pick();
    }, [open]);

    useEffect(() => {
        if (!open) return;
        return attend(cacheKey);
    }, [open, cacheKey, attend]);

    return (
        <AiSheet
            open={open}
            onClose={onClose}
            title="定向刷题"
            subtitle="按错题分布挑一组，不是随机抽"
        >
            <div className="space-y-3 pb-2">
                {loading && (
                    <div className="st-tiny flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-6">
                        正在翻错题、配题...
                    </div>
                )}

                {error && (
                    <div className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-6 text-amber-800">
                        {error}
                    </div>
                )}

                {items.length > 0 && (
                    <>
                        {reason && <div className="st-tiny">{reason}</div>}
                        <ul className="space-y-1.5">
                            {items.map((item, index) => (
                                <li
                                    key={item.id}
                                    className="rounded-xl border border-border/60 bg-card px-3 py-2"
                                >
                                    <div className="st-tiny">
                                        {index + 1}.{" "}
                                        {moduleName(subject, item.m)}
                                    </div>
                                    <div className="mt-0.5 line-clamp-2 text-[13px] leading-5">
                                        {item.stem}
                                    </div>
                                </li>
                            ))}
                        </ul>

                        <div className="flex gap-2">
                            <button
                                className="st-btn line sm flex-1"
                                onClick={() => void pick(true)}
                                disabled={loading}
                            >
                                换一组
                            </button>
                            <button
                                className="st-btn sm flex-1"
                                onClick={() => {
                                    onStart(items);
                                    onClose();
                                }}
                            >
                                开始这 {items.length} 道
                            </button>
                        </div>
                    </>
                )}

                {!loading && items.length === 0 && (
                    <button
                        className="st-btn sm block w-full"
                        onClick={() => void pick(true)}
                    >
                        再挑一次
                    </button>
                )}

                {fallbackIds.length > 0 && (
                    <div className="st-tiny text-center">
                        这组来自题库里的弱项模块
                    </div>
                )}
            </div>
        </AiSheet>
    );
}
