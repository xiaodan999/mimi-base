/**
 * AI 生成内容的本地缓存。
 * 只写 localStorage，不同步到云端；换设备会重新生成。
 */

const PREFIX = "mimi:ai-cache:v1:";
const LEGACY_PREFIX = "mimi-study:ai-cache:v1:";

export function readAiCache<T>(key: string): T | null {
    if (typeof window === "undefined") return null;
    try {
        const raw =
            localStorage.getItem(PREFIX + key) ??
            localStorage.getItem(LEGACY_PREFIX + key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export function writeAiCache<T>(key: string, value: T) {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
        // 空间满了或被禁用时静默失败，不影响当前会话
    }
}

/** 生成结果不满意时，丢掉这一条再重算。 */
export function removeAiCache(key: string) {
    if (typeof window === "undefined") return;
    try {
        localStorage.removeItem(PREFIX + key);
        localStorage.removeItem(LEGACY_PREFIX + key);
    } catch {
        // ignore
    }
}

export function clearAiCache() {
    if (typeof window === "undefined") return;
    try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(PREFIX) || key?.startsWith(LEGACY_PREFIX)) {
                keys.push(key);
            }
        }
        keys.forEach((key) => localStorage.removeItem(key));
    } catch {
        // ignore
    }
}

/** 把一段文本压成短 key，用于「同一道题 + 同一个答案」的批改缓存 */
export function hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = (hash * 31 + text.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
}
