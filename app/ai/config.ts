/**
 * AI 设置只存在浏览器 localStorage，不会经过 PocketBase。
 *
 * 站点统一提供 API Key（见 pocketbase/ai-relay.ts），所以这里只剩通知和
 * 本机预算两项；旧版本保存的服务商地址 / Key 会在读取时被清掉。
 */

import {
    AI_SETTINGS_KEY as STORAGE_KEY,
    LEGACY_SETTINGS_KEY as LEGACY_STORAGE_KEY,
} from "./constants";

export type AiSettings = {
    /** 任务完成时，如果 App 在后台就发系统通知 */
    notify: boolean;
    /** 每天最多花多少美元（估算）；<= 0 表示不限制 */
    dailyBudgetUsd: number;
};

const SESSION_KEY = "mimi:ai-session:v1";
const LEGACY_SESSION_KEY = "mimi-study:ai-session:v1";

export const DEFAULT_SETTINGS: AiSettings = {
    notify: false,
    dailyBudgetUsd: 0,
};

function readValue(primary: string, legacy: string): string | null {
    const current = localStorage.getItem(primary);
    if (current) return current;
    const old = localStorage.getItem(legacy);
    if (!old) return null;
    // 读到旧键时顺手搬过来，之后就不用再回退。
    try {
        localStorage.setItem(primary, old);
        localStorage.removeItem(legacy);
    } catch {
        // 迁不迁都不影响这次读取
    }
    return old;
}

function normalize(settings: Partial<AiSettings>): AiSettings {
    return {
        notify: settings.notify === true,
        dailyBudgetUsd:
            typeof settings.dailyBudgetUsd === "number" &&
            Number.isFinite(settings.dailyBudgetUsd) &&
            settings.dailyBudgetUsd > 0
                ? settings.dailyBudgetUsd
                : 0,
    };
}

export function readAiSettings(): AiSettings {
    if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
    try {
        const raw = readValue(STORAGE_KEY, LEGACY_STORAGE_KEY);
        if (!raw) return { ...DEFAULT_SETTINGS };
        const parsed = JSON.parse(raw) as Partial<AiSettings> & {
            baseUrl?: unknown;
            apiKey?: unknown;
            model?: unknown;
        };
        const settings = normalize(parsed);
        // 旧版本把服务商、模型和 API Key 存在这里。现在统一由站点提供，
        // 读到就覆盖成干净的设置，避免密钥继续留在设备上。
        const sanitized = JSON.stringify(settings);
        if (raw !== sanitized) {
            localStorage.setItem(STORAGE_KEY, sanitized);
            localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
        return settings;
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export function writeAiSettings(settings: AiSettings) {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(settings)));
        localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
        // 隐私模式下 localStorage 可能不可写，忽略即可
    }
}

/** 站点 AI 中转路由（Bun supervisor，挂在 `/api/ai` 下）。 */
export const OPENCODE_RELAY_PATH = "/ai/opencode/v1";

/**
 * 中转地址跟着当前部署的 API origin 走，不能把保存时的 origin 写死：
 * 同一份设置在 localhost 和局域网 IP 之间切换时也要能用。
 */
export function openCodeRelayBaseUrl(apiOrigin: string): string {
    return `${apiOrigin.replace(/\/+$/, "")}/api${OPENCODE_RELAY_PATH}`;
}

/**
 * OpenCode Go 要求每次对话带一个稳定的 x-opencode-session。
 * 用 sessionStorage 生成一个标签页级 ID，关掉标签页就换新的。
 */
export function getAiSessionId(): string {
    if (typeof window === "undefined") return "mimi-base";
    try {
        const existing =
            sessionStorage.getItem(SESSION_KEY) ??
            sessionStorage.getItem(LEGACY_SESSION_KEY);
        if (existing) {
            sessionStorage.setItem(SESSION_KEY, existing);
            return existing;
        }
        const id =
            typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `mimi-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        sessionStorage.setItem(SESSION_KEY, id);
        return id;
    } catch {
        return "mimi-base";
    }
}
