import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth";
import pb from "@/lib/pb";
import { qk } from "@/lib/query-keys";

import { emptyProgress, type Progress } from "./types";

const COLLECTION = "study_progress";
const SAVE_DELAY = 700;

type StudyRecord = {
    id: string;
    user_id: string;
    subject_id: string;
    data: Progress;
};

const localKey = (subjectId: string) => `mimi-study:${subjectId}:v1`;

function readLocal(subjectId: string): Progress | null {
    try {
        const raw = localStorage.getItem(localKey(subjectId));
        if (!raw) return null;
        return { ...emptyProgress(), ...(JSON.parse(raw) as Progress) };
    } catch {
        return null;
    }
}

function writeLocal(subjectId: string, progress: Progress) {
    try {
        localStorage.setItem(localKey(subjectId), JSON.stringify(progress));
    } catch {
        // 隐私模式下 localStorage 可能不可写，忽略即可
    }
}

/**
 * 学习进度：PocketBase 为准，localStorage 做离线缓存与首屏秒开。
 *
 * 用法：
 *   const { progress, update, saving, loading } = useStudyProgress(subjectId);
 *   update((p) => ({ ...p, cards: { ...p.cards, [id]: { k: 1 } } }));
 */
export function useStudyProgress(subjectId: string) {
    const { user } = useAuth();
    const userId = user?.id ?? "";
    const queryClient = useQueryClient();

    const [progress, setProgress] = useState<Progress>(
        () => readLocal(subjectId) ?? emptyProgress(),
    );
    const [saving, setSaving] = useState(false);
    const recordId = useRef<string | null>(null);
    const latest = useRef(progress);
    const timer = useRef<number | null>(null);
    const hydrated = useRef(false);

    const queryKey = useMemo(
        () => qk.studyProgress(userId, subjectId),
        [subjectId, userId],
    );

    const query = useQuery({
        queryKey,
        enabled: Boolean(userId),
        staleTime: 5 * 60 * 1000,
        queryFn: async (): Promise<StudyRecord | null> => {
            const list = await pb.collection(COLLECTION).getList(1, 1, {
                filter: pb.filter("user_id = {:uid} && subject_id = {:sid}", {
                    uid: userId,
                    sid: subjectId,
                }),
            });
            return (list.items[0] as unknown as StudyRecord) ?? null;
        },
    });

    // 首次拉取成功时以服务端为准（只 hydrate 一次，避免覆盖本地未保存的改动）
    useEffect(() => {
        if (!query.isSuccess || hydrated.current) return;
        hydrated.current = true;
        const record = query.data;
        recordId.current = record?.id ?? null;
        if (record?.data) {
            const remote = { ...emptyProgress(), ...record.data };
            latest.current = remote;
            setProgress(remote);
            writeLocal(subjectId, remote);
        }
    }, [query.isSuccess, query.data, subjectId]);

    const flush = useCallback(async () => {
        const snapshot = latest.current;
        writeLocal(subjectId, snapshot);
        if (!userId) return;
        setSaving(true);
        try {
            if (recordId.current) {
                await pb
                    .collection(COLLECTION)
                    .update(recordId.current, { data: snapshot });
            } else {
                const created = await pb.collection(COLLECTION).create({
                    user_id: userId,
                    subject_id: subjectId,
                    data: snapshot,
                });
                recordId.current = created.id;
            }
        } catch (error) {
            // 记录被删或网络异常：清掉 id，下次重建
            recordId.current = null;
            console.warn("学习进度同步失败，已保存在本地", error);
        } finally {
            setSaving(false);
            queryClient.setQueryData(queryKey, {
                id: recordId.current ?? "",
                user_id: userId,
                subject_id: subjectId,
                data: snapshot,
            });
        }
    }, [queryClient, queryKey, subjectId, userId]);

    const update = useCallback(
        (mutate: (current: Progress) => Progress) => {
            const next = mutate(latest.current);
            latest.current = next;
            setProgress(next);
            if (timer.current) window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => {
                timer.current = null;
                void flush();
            }, SAVE_DELAY);
        },
        [flush],
    );

    // 页面隐藏 / 卸载前把未落库的改动刷出去
    useEffect(() => {
        const handler = () => {
            if (timer.current) {
                window.clearTimeout(timer.current);
                timer.current = null;
                void flush();
            }
        };
        document.addEventListener("visibilitychange", handler);
        return () => {
            document.removeEventListener("visibilitychange", handler);
            handler();
        };
    }, [flush]);

    const reset = useCallback(() => {
        const blank = emptyProgress();
        latest.current = blank;
        setProgress(blank);
        writeLocal(subjectId, blank);
        void flush();
    }, [flush, subjectId]);

    return {
        progress,
        update,
        reset,
        saving,
        loading: query.isPending,
    };
}

/** 学习基地总览用：一次拉回当前用户所有科目的进度 */
export function useStudySummaries() {
    const { user } = useAuth();
    const userId = user?.id ?? "";

    return useQuery({
        queryKey: qk.studySummaries(userId),
        enabled: Boolean(userId),
        staleTime: 60 * 1000,
        queryFn: async (): Promise<Record<string, Progress>> => {
            const list = await pb.collection(COLLECTION).getFullList({
                filter: pb.filter("user_id = {:uid}", { uid: userId }),
            });
            const map: Record<string, Progress> = {};
            for (const record of list as unknown as StudyRecord[]) {
                map[record.subject_id] = {
                    ...emptyProgress(),
                    ...record.data,
                };
            }
            return map;
        },
    });
}
