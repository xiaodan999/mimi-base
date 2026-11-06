import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth";
import pb from "@/lib/pb";
import { qk } from "@/lib/query-keys";

import { mergeProgress, normalizeProgress } from "./merge";
import { emptyProgress, type Progress } from "./types";

const COLLECTION = "study_progress";
const SAVE_DELAY = 700;

/**
 * 总览查询的本地前缀。lib/query-keys.ts 由另一个分支维护，这里先就近定义，
 * 落地时再收敛成 qk.studySummaries.all（见最终报告 NEEDS INTEGRATION PASS）。
 * 用前缀而不是具体 key，flush 时一次 invalidate 就能覆盖所有用户的总览。
 */
export const STUDY_SUMMARIES_KEY = ["studySummaries"] as const;

type StudyRecord = {
    id: string;
    user_id: string;
    subject_id: string;
    data: Progress;
    /** PocketBase 自带字段；留作扩展（CAS/ETag）。 */
    updated?: string;
};

/** localStorage 按 用户:科目 隔离，避免共享浏览器时串号。 */
const localKey = (userId: string, subjectId: string) =>
    `mimi-study:${userId}:${subjectId}:v1`;

function readLocal(userId: string, subjectId: string): Progress | null {
    try {
        const raw = localStorage.getItem(localKey(userId, subjectId));
        if (!raw) return null;
        return normalizeProgress(JSON.parse(raw) as Partial<Progress>);
    } catch {
        return null;
    }
}

function writeLocal(
    userId: string,
    subjectId: string,
    progress: Progress,
): void {
    try {
        localStorage.setItem(
            localKey(userId, subjectId),
            JSON.stringify(progress),
        );
    } catch {
        // 隐私模式下 localStorage 可能不可写，忽略即可
    }
}

/** 退出登录 / 切换账号时清掉上一个账号的离线缓存。 */
function clearUserLocal(userId: string): void {
    if (!userId) return;
    try {
        const prefix = `mimi-study:${userId}:`;
        const stale: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) stale.push(key);
        }
        for (const key of stale) localStorage.removeItem(key);
    } catch {
        // 忽略
    }
}

/** 按唯一键 (user_id, subject_id) 找回记录，create 前必调，避免撞唯一索引。 */
async function findRecord(
    userId: string,
    subjectId: string,
): Promise<StudyRecord | null> {
    const list = await pb.collection(COLLECTION).getList(1, 1, {
        filter: pb.filter("user_id = {:uid} && subject_id = {:sid}", {
            uid: userId,
            sid: subjectId,
        }),
    });
    return (list.items[0] as unknown as StudyRecord) ?? null;
}

/**
 * 学习进度：PocketBase 为准，localStorage 做离线缓存与首屏秒开。
 *
 * 用法：
 *   const { progress, update, saving, error, offline } = useStudyProgress(id);
 *   update((p) => ({ ...p, cards: { ...p.cards, [id]: { k: 1 } } }));
 */
export function useStudyProgress(subjectId: string) {
    const { user } = useAuth();
    const userId = user?.id ?? "";
    const queryClient = useQueryClient();

    const [progress, setProgress] = useState<Progress>(
        () => readLocal(userId, subjectId) ?? emptyProgress(),
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(false);
    const [online, setOnline] = useState(() =>
        typeof navigator === "undefined" ? true : navigator.onLine,
    );

    const recordId = useRef<string | null>(null);
    const latest = useRef(progress);
    const timer = useRef<number | null>(null);
    const hydrated = useRef(false);
    const hadError = useRef(false);
    const prevScope = useRef({ userId, subjectId });

    const queryKey = useMemo(
        () => qk.studyProgress(userId, subjectId),
        [subjectId, userId],
    );
    const summariesKey = useMemo(
        () => [...STUDY_SUMMARIES_KEY, userId] as const,
        [userId],
    );

    const query = useQuery({
        queryKey,
        enabled: Boolean(userId),
        staleTime: 5 * 60 * 1000,
        queryFn: async (): Promise<StudyRecord | null> =>
            findRecord(userId, subjectId),
    });

    // 账号切换 / 退出登录 / 换科目：重置 hydrated、recordId、本地快照。
    // 重置 hydrated 才能让新账号/科目的查询结果重新 hydrate（服务端为准）。
    useEffect(() => {
        const prev = prevScope.current;
        if (prev.userId === userId && prev.subjectId === subjectId) return;
        if (prev.userId && prev.userId !== userId) clearUserLocal(prev.userId);
        prevScope.current = { userId, subjectId };
        if (timer.current) {
            window.clearTimeout(timer.current);
            timer.current = null;
        }
        hydrated.current = false;
        recordId.current = null;
        const fresh = readLocal(userId, subjectId) ?? emptyProgress();
        latest.current = fresh;
        setProgress(fresh);
        setError(false);
        hadError.current = false;
    }, [userId, subjectId]);

    // 首次拉取成功时以服务端为准（只 hydrate 一次，避免覆盖本地未保存的改动）
    useEffect(() => {
        if (!query.isSuccess || hydrated.current) return;
        hydrated.current = true;
        const record = query.data;
        recordId.current = record?.id ?? null;
        if (record?.data) {
            const remote = normalizeProgress(record.data);
            latest.current = remote;
            setProgress(remote);
            writeLocal(userId, subjectId, remote);
        }
    }, [query.isSuccess, query.data, subjectId, userId]);

    /**
     * 合并写入：落库前按唯一键重新 getList，把服务端快照与本地快照 merge 后
     * 再写，避免两个标签页/设备用整份快照互相覆盖。
     * replace=true 用于 reset()：整份清空，不走 merge（否则会被旧数据复活）。
     */
    const flush = useCallback(
        async (replace = false) => {
            const snapshot = latest.current;
            // 未登录时不写本地、不发请求，避免留下 `mimi-study::...` 垃圾键。
            if (!userId) return;
            writeLocal(userId, subjectId, snapshot);
            setSaving(true);
            try {
                const server = await findRecord(userId, subjectId);
                if (server) {
                    recordId.current = server.id;
                    const remote = normalizeProgress(server.data);
                    const data = replace
                        ? snapshot
                        : mergeProgress(remote, snapshot);
                    await pb.collection(COLLECTION).update(server.id, { data });
                } else {
                    const created = await pb.collection(COLLECTION).create({
                        user_id: userId,
                        subject_id: subjectId,
                        data: snapshot,
                    });
                    recordId.current = created.id;
                }
                setError(false);
                hadError.current = false;
                // 总览（首页 / 报告）此前从不失效，进度写完就刷新它。
                void queryClient.invalidateQueries({
                    queryKey: STUDY_SUMMARIES_KEY,
                });
            } catch (err) {
                // 关键：不再清空 recordId。下一次 flush 会重新 getList，
                // 找到就 update、找不到才 create，不会陷入唯一约束死循环。
                // 本地快照已写好，标记为失败并保留，联网后自动重试。
                setError(true);
                hadError.current = true;
                console.warn("学习进度同步失败，已保存在本地", err);
            } finally {
                setSaving(false);
                queryClient.setQueryData(queryKey, {
                    id: recordId.current ?? "",
                    user_id: userId,
                    subject_id: subjectId,
                    data: latest.current,
                });
            }
        },
        [queryClient, queryKey, subjectId, userId],
    );

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

    // 在线 / 离线状态
    useEffect(() => {
        if (typeof window === "undefined") return;
        const goOnline = () => setOnline(true);
        const goOffline = () => setOnline(false);
        window.addEventListener("online", goOnline);
        window.addEventListener("offline", goOffline);
        return () => {
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
        };
    }, []);

    // 重新联网后自动重试上一次失败的同步
    useEffect(() => {
        if (online && hadError.current) void flush();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [online]);

    const reset = useCallback(() => {
        const blank = emptyProgress();
        latest.current = blank;
        setProgress(blank);
        writeLocal(userId, subjectId, blank);
        if (timer.current) {
            window.clearTimeout(timer.current);
            timer.current = null;
        }
        void flush(true);
    }, [flush, subjectId, userId]);

    return {
        progress,
        update,
        reset,
        saving,
        /** 最近一次同步是否失败（已存本地，待重试） */
        error,
        /** 浏览器是否离线 */
        offline: !online,
        loading: query.isPending,
    };
}

/** 学习基地总览用：一次拉回当前用户所有科目的进度 */
export function useStudySummaries() {
    const { user } = useAuth();
    const userId = user?.id ?? "";

    return useQuery({
        queryKey: [...STUDY_SUMMARIES_KEY, userId] as const,
        enabled: Boolean(userId),
        staleTime: 60 * 1000,
        queryFn: async (): Promise<Record<string, Progress>> => {
            const list = await pb.collection(COLLECTION).getFullList({
                filter: pb.filter("user_id = {:uid}", { uid: userId }),
            });
            const map: Record<string, Progress> = {};
            for (const record of list as unknown as StudyRecord[]) {
                map[record.subject_id] = normalizeProgress(record.data);
            }
            return map;
        },
    });
}
