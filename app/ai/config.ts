/**
 * AI 设置只存在浏览器 localStorage，不会经过 PocketBase。
 * 换设备需要重新粘贴 Key。
 */

import { clearAiCache } from "./cache";
import {
    AI_SETTINGS_KEY as STORAGE_KEY,
    LEGACY_SETTINGS_KEY as LEGACY_STORAGE_KEY,
} from "./constants";

export type AiSettings = {
    baseUrl: string;
    apiKey: string;
    model: string;
    /** 任务完成时，如果 App 在后台就发系统通知 */
    notify: boolean;
    /** 每天最多花多少美元（估算）；<= 0 表示不限制 */
    dailyBudgetUsd: number;
};

export type AiPreset = {
    id: string;
    name: string;
    baseUrl: string;
    model: string;
    note: string;
};

export const AI_PRESETS: AiPreset[] = [
    {
        id: "deepseek",
        name: "DeepSeek",
        baseUrl: "https://api.deepseek.com/v1",
        model: "deepseek-chat",
        note: "支持浏览器直连，中文和性价比都不错",
    },
    {
        id: "opencode-go-pb",
        // OpenCode Go 的官方地址不返回 CORS 头，浏览器直连一定失败，
        // 所以只保留经 PocketBase 中转的这一条。
        name: "OpenCode Go（PocketBase 中转）",
        baseUrl: "",
        model: "deepseek-v4.1-flash",
        note: "官方地址不支持浏览器直连，这里自动经 PocketBase 转发；Key 只在请求时经过，不落库",
    },
    {
        id: "openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        model: "openai/gpt-4o-mini",
        note: "支持浏览器直连，一个 Key 可以换很多模型",
    },
    {
        id: "siliconflow",
        name: "硅基流动",
        baseUrl: "https://api.siliconflow.cn/v1",
        model: "Qwen/Qwen2.5-7B-Instruct",
        note: "支持浏览器直连，国内访问快",
    },
    {
        id: "moonshot",
        name: "Moonshot",
        baseUrl: "https://api.moonshot.cn/v1",
        model: "moonshot-v1-8k",
        note: "支持浏览器直连，长文本能力好",
    },
    {
        id: "openai",
        name: "OpenAI 官方",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        note: "官方接口不允许浏览器直连，需要填中转地址",
    },
];

export const CUSTOM_PRESET_ID = "custom";

const SESSION_KEY = "mimi:ai-session:v1";
const LEGACY_SESSION_KEY = "mimi-study:ai-session:v1";

export const DEFAULT_SETTINGS: AiSettings = {
    baseUrl: AI_PRESETS[0].baseUrl,
    apiKey: "",
    model: AI_PRESETS[0].model,
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

export function readAiSettings(): AiSettings {
    if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
    try {
        const raw = readValue(STORAGE_KEY, LEGACY_STORAGE_KEY);
        if (!raw) return { ...DEFAULT_SETTINGS };
        const parsed = JSON.parse(raw) as Partial<AiSettings>;
        return {
            baseUrl:
                typeof parsed.baseUrl === "string"
                    ? parsed.baseUrl
                    : DEFAULT_SETTINGS.baseUrl,
            apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
            model:
                typeof parsed.model === "string"
                    ? parsed.model
                    : DEFAULT_SETTINGS.model,
            notify: parsed.notify === true,
            dailyBudgetUsd:
                typeof parsed.dailyBudgetUsd === "number" &&
                Number.isFinite(parsed.dailyBudgetUsd)
                    ? parsed.dailyBudgetUsd
                    : 0,
        };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

/** 换地址 / 换模型 / 换 Key 之后旧结果才不可信；通知和预算不影响结果。 */
function changesProvider(
    previousRaw: string | null,
    next: AiSettings,
): boolean {
    if (!previousRaw) return true;
    try {
        const previous = JSON.parse(previousRaw) as Partial<AiSettings>;
        return (
            (previous.baseUrl ?? "") !== next.baseUrl ||
            (previous.model ?? "") !== next.model ||
            (previous.apiKey ?? "") !== next.apiKey
        );
    } catch {
        return true;
    }
}

export function writeAiSettings(settings: AiSettings) {
    if (typeof window === "undefined") return;
    try {
        const next = JSON.stringify(settings);
        const previous = localStorage.getItem(STORAGE_KEY);
        // 只有换模型 / 换地址 / 换 Key 才作废 AI 缓存。之前只要任意设置变了
        // （包括打开通知开关、改预算）就清空全部缓存，白花钱重新生成。
        if (changesProvider(previous, settings)) clearAiCache();
        localStorage.setItem(STORAGE_KEY, next);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
        // 隐私模式下 localStorage 可能不可写，忽略即可
    }
}

export function isAiConfigured(settings: AiSettings): boolean {
    return Boolean(
        settings.baseUrl.trim() &&
        settings.apiKey.trim() &&
        settings.model.trim(),
    );
}

/** OpenCode Go 的中转路由挂在 PocketBase 的 `/api` 下。 */
export const OPENCODE_RELAY_PATH = "/api/ai/opencode/v1";

/**
 * 中转地址必须跟着当前的 PocketBase 地址走，不能把保存时的 origin
 * 写死：同一份设置在 localhost 和局域网 IP 之间切换时也要能用。
 */
export function openCodeRelayBaseUrl(pbBaseUrl: string): string {
    return `${pbBaseUrl.replace(/\/+$/, "")}${OPENCODE_RELAY_PATH}`;
}

/** 官方 OpenCode 地址；浏览器直连会被 CORS 拦掉。 */
export function isDirectOpenCodeBaseUrl(baseUrl: string): boolean {
    try {
        const url = new URL(baseUrl.trim());
        return (
            url.hostname === "opencode.ai" &&
            /^\/(inference\/go\/openai|zen\/go)(\/|$)/.test(url.pathname)
        );
    } catch {
        return false;
    }
}

/** 之前保存的、指向本应用中转路由的地址（origin 可能已经变了）。 */
export function isOpenCodeRelayBaseUrl(baseUrl: string): boolean {
    try {
        return new URL(baseUrl.trim()).pathname.startsWith(OPENCODE_RELAY_PATH);
    } catch {
        return false;
    }
}

/**
 * 把历史上保存的 OpenCode Go 直连地址改写成 PocketBase 中转地址。
 * 直连在浏览器里必定失败，旧设置留着会让整个 AI 功能看起来坏掉。
 */
export function migrateAiSettings(
    settings: AiSettings,
    relayBaseUrl: string,
): { settings: AiSettings; changed: boolean } {
    const baseUrl = settings.baseUrl
        .trim()
        .replace(/\/chat\/completions\/?$/i, "");
    if (!isDirectOpenCodeBaseUrl(baseUrl) && !isOpenCodeRelayBaseUrl(baseUrl)) {
        return { settings, changed: false };
    }
    const next = relayBaseUrl.replace(/\/+$/, "");
    if (next === settings.baseUrl) return { settings, changed: false };
    return { settings: { ...settings, baseUrl: next }, changed: true };
}

export function matchPreset(
    settings: AiSettings,
    resolveBaseUrl?: (preset: AiPreset) => string,
): string {
    const found = AI_PRESETS.find((preset) => {
        const baseUrl = resolveBaseUrl
            ? resolveBaseUrl(preset)
            : preset.baseUrl;
        return (
            baseUrl === settings.baseUrl.trim() &&
            preset.model === settings.model.trim()
        );
    });
    return found?.id ?? CUSTOM_PRESET_ID;
}

/**
 * GET {baseUrl}/models 拉取可用模型 id。失败（CORS / 不支持 / 网络）时返回
 * 空数组，设置页和兜底路由据此降级，不把整个 AI 功能弄坏。
 */
export async function discoverModels(
    settings: AiSettings,
    signal?: AbortSignal,
): Promise<string[]> {
    const base = settings.baseUrl
        .trim()
        .replace(/\/+$/, "")
        .replace(/\/chat\/completions$/i, "");
    if (!base) return [];
    try {
        const res = await fetch(`${base}/models`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${settings.apiKey.trim()}`,
                "Content-Type": "application/json",
            },
            signal,
        });
        if (!res.ok) return [];
        const json = (await res.json()) as { data?: { id?: string }[] };
        return (json.data ?? [])
            .map((item) => item.id)
            .filter(
                (id): id is string => typeof id === "string" && id.length > 0,
            );
    } catch {
        return [];
    }
}

/** 从可用模型里挑一个兜底：优先聊天/指令类模型，避开 embedding 之类。 */
export function pickFallbackModel(
    current: string,
    available: string[],
): string | undefined {
    const usable = available.filter((id) => id && id !== current);
    if (usable.length === 0) return undefined;
    return (
        usable.find((id) =>
            /chat|instruct|turbo|flash|mini|gpt|qwen|deepseek|moonshot/i.test(
                id,
            ),
        ) ?? usable[0]
    );
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
