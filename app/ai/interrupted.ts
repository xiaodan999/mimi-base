import type { AiTurn } from "./AiPanel";
import type { AiMessage } from "./client";
import { AI_INTERRUPTED_KEY } from "./constants";
import type { AiTaskHref, AiTaskKind } from "./task-store";

/**
 * 页面被杀（Android 把后台标签冻结后回收）会连带杀掉内存里的任务队列。
 * 这个本地台账在任务启动时记下描述和可复现的 prompt，下次启动时任务中心
 * 把它们恢复成「被中断」的行，能续跑的一键重跑。
 *
 * 纯 localStorage 读写，方便单测；写失败（隐私模式/超配额）按没记处理。
 */

/** 可续跑任务的重复参数：原样重发 prompt 就能复现结果。 */
export type ResumePayload = {
    messages: AiMessage[];
    /** AiPanel 的追问任务返回 turns；没有这个字段的结果就是纯文本。 */
    history?: AiTurn[];
    maxTokens?: number;
    temperature?: number;
};

export type InterruptedTaskEntry = {
    id: string;
    key: string;
    group: string;
    cacheKey?: string;
    title: string;
    subtitle?: string;
    href?: AiTaskHref;
    kind: AiTaskKind;
    createdAt: number;
    resume?: ResumePayload;
    /** 已经恢复过一次就不再弹提醒，只安静地出现在任务中心。 */
    restoredAt?: number;
};

const MAX_ENTRIES = 10;

function readStore(): InterruptedTaskEntry[] {
    try {
        const raw = localStorage.getItem(AI_INTERRUPTED_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (entry): entry is InterruptedTaskEntry =>
                typeof entry === "object" &&
                entry !== null &&
                typeof (entry as InterruptedTaskEntry).id === "string" &&
                typeof (entry as InterruptedTaskEntry).key === "string",
        );
    } catch {
        return [];
    }
}

function writeStore(entries: InterruptedTaskEntry[]) {
    try {
        if (entries.length === 0) {
            localStorage.removeItem(AI_INTERRUPTED_KEY);
        } else {
            localStorage.setItem(AI_INTERRUPTED_KEY, JSON.stringify(entries));
        }
    } catch {
        // 隐私模式 / 配额满：台账写不进去就当没记，不影响任务本身
    }
}

/** 任务开跑：记一条（同 id 覆盖），超出上限丢最旧的。 */
export function recordInterruptibleTask(entry: InterruptedTaskEntry) {
    const entries = readStore().filter((item) => item.id !== entry.id);
    entries.unshift(entry);
    writeStore(entries.slice(0, MAX_ENTRIES));
}

/** 任务结束（完成/失败/取消）或被用户清掉：台账里删掉。 */
export function clearInterruptibleTask(id: string) {
    const entries = readStore();
    if (entries.every((item) => item.id !== id)) return;
    writeStore(entries.filter((item) => item.id !== id));
}

export function readInterruptibleTasks(): InterruptedTaskEntry[] {
    return readStore();
}

/** 恢复过的条目标个记号，下次启动不再为它弹提醒。 */
export function markInterruptibleRestored(ids: readonly string[]) {
    if (ids.length === 0) return;
    const marked = new Set(ids);
    const entries = readStore().map((entry) =>
        marked.has(entry.id) ? { ...entry, restoredAt: Date.now() } : entry,
    );
    writeStore(entries);
}
