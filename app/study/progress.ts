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
 * 总览查询的前缀。用前缀而不是具体 key，flush 时一次 invalidate 就能覆盖
 * 所有用户的总览；key 结构与 `qk.studySummariesAll` 保持一致。
 */
export const STUDY_SUMMARIES_KEY = qk.studySummariesAll;

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

/**
 * 「本地有改动还没同步成功」的标记。没有它，重新打开 App 时会以为一切正常
 * （error 初始 false），接着服务端 hydration 把没同步的本地快照覆盖掉。
 */
const pendingKey = (userId: string, subjectId: string) =>
    `mimi-study:${userId}:${subjectId}:pending`;

function hasPending(userId: string, subjectId: string): boolean {
    if (!userId) return false;
    try {
        return localStorage.getItem(pendingKey(userId, subjectId)) === "1";
    } catch {
        return false;
    }
}

function setPending(userId: string, subjectId: string, pending: boolean): void {
    if (!userId) return;
    try {
        if (pending) {
            localStorage.setItem(pendingKey(userId, subjectId), "1");
        } else {
            localStorage.removeItem(pendingKey(userId, subjectId));
        }
    } catch {
        // 同上，忽略
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
    // 上一次会话里没同步成功：挂载时就如实显示「待重试」，而不是「已同步」。
    const [error, setError] = useState(() => hasPending(userId, subjectId));
    const [online, setOnline] = useState(() =>
        typeof navigator === "undefined" ? true : navigator.onLine,
    );

    const recordId = useRef<string | null>(null);
    const latest = useRef(progress);
    const timer = useRef<number | null>(null);
    const hydrated = useRef(false);
    const hadError = useRef(hasPending(userId, subjectId));
    const savingNow = useRef(false);
    /** 已应用到界面的服务端版本，避免同一份快照反复覆盖本地状态。 */
    const appliedRemote = useRef<string | null>(null);
    /** 写入期间又有新改动：结束后补写一次。 */
    const dirtyAfterFlush = useRef(false);
    const prevScope = useRef({ userId, subjectId });

    const queryKey = useMemo(
        () => qk.studyProgress(userId, subjectId),
        [subjectId, userId],
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
        appliedRemote.current = null;
        const fresh = readLocal(userId, subjectId) ?? emptyProgress();
        const pending = hasPending(userId, subjectId);
        latest.current = fresh;
        setProgress(fresh);
        setError(pending);
        hadError.current = pending;
    }, [userId, subjectId]);

    // 首次拉取成功时以服务端为准（只 hydrate 一次）。上一个会话没同步成功
    // 时改成合并：服务端快照里没有本地那部分改动，直接覆盖会把它们丢掉。
    useEffect(() => {
        if (!query.isSuccess || hydrated.current) return;
        hydrated.current = true;
        const record = query.data;
        recordId.current = record?.id ?? null;
        appliedRemote.current = record?.updated ?? null;
        if (record?.data) {
            const remote = normalizeProgress(record.data);
            const local = readLocal(userId, subjectId);
            const pending = hasPending(userId, subjectId);
            const merged =
                pending && local ? mergeProgress(remote, local) : remote;
            latest.current = merged;
            setProgress(merged);
            writeLocal(userId, subjectId, merged);
        }
    }, [query.isSuccess, query.data, subjectId, userId]);

    // 另一台设备改动后，realtime 同步会失效 `study-progress` 前缀并重新拉取。
    // 空闲时把服务端版本应用回来；本地有未落库的改动时不覆盖，交给 flush
    // 先合并再写，避免把刚答的题冲掉。
    useEffect(() => {
        if (!query.isSuccess || !hydrated.current) return;
        const record = query.data;
        if (!record?.data || !record.updated) return;
        if (record.updated === appliedRemote.current) return;
        appliedRemote.current = record.updated;
        if (
            savingNow.current ||
            timer.current !== null ||
            hasPending(userId, subjectId)
        ) {
            return;
        }
        const remote = normalizeProgress(record.data);
        if (JSON.stringify(remote) === JSON.stringify(latest.current)) return;
        latest.current = remote;
        setProgress(remote);
        writeLocal(userId, subjectId, remote);
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
            // 重试定时器 / 事件回调可能叠加，同一时间只允许一次写入；
            // 但这次改动不能被丢掉——记下来，当前请求结束后再写一遍。
            if (savingNow.current) {
                dirtyAfterFlush.current = true;
                return;
            }
            savingNow.current = true;
            writeLocal(userId, subjectId, snapshot);
            // 先打上待同步标记：请求途中被关掉，下次启动仍会重试。
            setPending(userId, subjectId, true);
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
                setPending(userId, subjectId, false);
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
                setPending(userId, subjectId, true);
                setError(true);
                hadError.current = true;
                console.warn("学习进度同步失败，已保存在本地", err);
            } finally {
                savingNow.current = false;
                setSaving(false);
                queryClient.setQueryData(queryKey, {
                    id: recordId.current ?? "",
                    user_id: userId,
                    subject_id: subjectId,
                    data: latest.current,
                });
                if (dirtyAfterFlush.current) {
                    dirtyAfterFlush.current = false;
                    void flush();
                }
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

    // 同步失败后自动重试：联网、回到前台/窗口聚焦，以及失败期间每 20 秒一次。
    // 只在 online 事件上重试不够——服务端 5xx、PB 重启时浏览器一直在线，
    // 那笔改动就再也不会重试。
    useEffect(() => {
        if (!error || !online) return;
        const retry = () => {
            if (hadError.current) void flush();
        };
        retry();
        const id = window.setInterval(retry, 20_000);
        const onVisible = () => {
            if (document.visibilityState === "visible") retry();
        };
        window.addEventListener("focus", retry);
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            window.clearInterval(id);
            window.removeEventListener("focus", retry);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [error, online, flush]);

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
