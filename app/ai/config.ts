/**
 * AI 设置只存在浏览器 localStorage，不会经过 PocketBase。
 * 换设备需要重新粘贴 Key。
 */

export type AiSettings = {
    baseUrl: string;
    apiKey: string;
    model: string;
    /** 任务完成时，如果 App 在后台就发系统通知 */
    notify: boolean;
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
        name: "OpenCode Go（PocketBase 中转）",
        baseUrl: "",
        model: "deepseek-v4.1-flash",
        note: "通过你的 PocketBase 转发；Key 只在请求时经过，不落库",
    },
    {
        id: "opencode-go",
        name: "OpenCode Go（官方直连）",
        baseUrl: "https://opencode.ai/inference/go/openai/v1",
        model: "deepseek-v4.1-flash",
        note: "官方接口不返回 CORS 头，浏览器直连会被拦；有支持跨域的中转地址再选这个",
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

/** AI 设置现在全站共用，键名从 study 私有迁移到 app 级。 */
const STORAGE_KEY = "mimi:ai:v1";
const LEGACY_STORAGE_KEY = "mimi-study:ai:v1";
const SESSION_KEY = "mimi:ai-session:v1";
const LEGACY_SESSION_KEY = "mimi-study:ai-session:v1";

export const DEFAULT_SETTINGS: AiSettings = {
    baseUrl: AI_PRESETS[0].baseUrl,
    apiKey: "",
    model: AI_PRESETS[0].model,
    notify: false,
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
        };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export function writeAiSettings(settings: AiSettings) {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
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
