import { getAiSessionId, type AiSettings } from "./config";

export type AiRole = "system" | "user" | "assistant";

export type AiMessage = {
    role: AiRole;
    content: string;
};

type ChatResponse = {
    choices?: {
        message?: { content?: string };
        delta?: { content?: string };
    }[];
};

export class AiError extends Error {
    status?: number;

    constructor(message: string, status?: number) {
        super(message);
        this.name = "AiError";
        this.status = status;
    }
}

/** 兼容用户填 base URL 或完整地址两种写法 */
export function chatEndpoint(baseUrl: string): string {
    const trimmed = baseUrl.trim().replace(/\/+$/, "");
    if (!trimmed) return "";
    if (/\/chat\/completions$/.test(trimmed)) return trimmed;
    return `${trimmed}/chat/completions`;
}

function friendlyStatus(status: number): string {
    if (status === 401 || status === 403) return "API Key 不对或没有权限";
    if (status === 404) return "地址或模型名不对，检查 base URL 和 model";
    if (status === 429) return "请求太频繁或额度用完了，歇一会儿再试";
    if (status >= 500) return "服务端开小差了，稍后再试";
    return `请求失败（HTTP ${status}）`;
}

async function readError(res: Response): Promise<AiError> {
    let detail = "";
    try {
        const text = await res.text();
        try {
            const json = JSON.parse(text) as {
                error?: { message?: string };
                message?: string;
            };
            detail = json.error?.message ?? json.message ?? text;
        } catch {
            detail = text;
        }
    } catch {
        // ignore
    }
    const hint = friendlyStatus(res.status);
    return new AiError(
        detail ? `${hint}（${detail.slice(0, 160)}）` : hint,
        res.status,
    );
}

export function aiErrorText(error: unknown): string {
    if (error instanceof AiError) return error.message;
    if (error instanceof DOMException && error.name === "AbortError") {
        return "已取消";
    }
    if (error instanceof TypeError) {
        return "请求没发出去：可能是网络问题，或这个服务不允许浏览器直连（CORS）。可以在设置里换一个支持跨域的 base URL。";
    }
    return error instanceof Error ? error.message : "AI 请求失败";
}

function isOpenCodeGo(baseUrl: string): boolean {
    return (
        /opencode\.ai\/inference\/go\//i.test(baseUrl) ||
        /\/api\/ai\/opencode(\/|$)/i.test(baseUrl)
    );
}

function headers(settings: AiSettings): HeadersInit {
    const result: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey.trim()}`,
    };
    if (isOpenCodeGo(settings.baseUrl)) {
        result["x-opencode-session"] = getAiSessionId();
        result["X-Client"] = "mimi-base/1.0";
    }
    return result;
}

function payload(
    settings: AiSettings,
    messages: AiMessage[],
    stream: boolean,
    temperature: number,
): string {
    return JSON.stringify({
        model: settings.model.trim(),
        messages,
        stream,
        temperature,
    });
}

/**
 * 流式对话：逐段 yield 文本，适合讲解 / 错题分析 / 周报。
 */
export async function* streamChat(
    settings: AiSettings,
    messages: AiMessage[],
    signal?: AbortSignal,
): AsyncGenerator<string> {
    const url = chatEndpoint(settings.baseUrl);
    if (!url) throw new AiError("还没填 API 地址");

    const res = await fetch(url, {
        method: "POST",
        headers: headers(settings),
        body: payload(settings, messages, true, 0.7),
        signal,
    });
    if (!res.ok) throw await readError(res);

    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("event-stream") || !res.body) {
        // 个别服务会忽略 stream，直接返回一整段 JSON
        const json = (await res.json()) as ChatResponse;
        const content = json.choices?.[0]?.message?.content;
        if (content) yield content;
        return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const emit = (raw: string): string | null => {
        const line = raw.trim();
        if (!line.startsWith("data:")) return null;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") return null;
        try {
            const json = JSON.parse(data) as ChatResponse;
            return json.choices?.[0]?.delta?.content ?? null;
        } catch {
            return null;
        }
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
            const delta = emit(line);
            if (delta) yield delta;
        }
    }

    const tail = emit(buffer);
    if (tail) yield tail;
}

function parseJson<T>(content: string): T | undefined {
    const text = content
        .trim()
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/, "")
        .trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return undefined;
    try {
        return JSON.parse(text.slice(start, end + 1)) as T;
    } catch {
        return undefined;
    }
}

/**
 * 一次性 JSON 对话：用于批改、变式题、今日计划这类需要结构化结果的场景。
 * 模型偶尔会包 markdown 代码块，这里会自动剥掉；格式不对会重试一次。
 */
export async function chatJSON<T>(
    settings: AiSettings,
    messages: AiMessage[],
    signal?: AbortSignal,
): Promise<T> {
    const url = chatEndpoint(settings.baseUrl);
    if (!url) throw new AiError("还没填 API 地址");

    const ask = async (list: AiMessage[]): Promise<string> => {
        const res = await fetch(url, {
            method: "POST",
            headers: headers(settings),
            body: payload(settings, list, false, 0.3),
            signal,
        });
        if (!res.ok) throw await readError(res);
        const json = (await res.json()) as ChatResponse;
        return json.choices?.[0]?.message?.content ?? "";
    };

    const content = await ask(messages);
    const parsed = parseJson<T>(content);
    if (parsed !== undefined) return parsed;

    const retry = await ask([
        ...messages,
        { role: "assistant", content },
        {
            role: "user",
            content:
                "上一次输出不是合法 JSON。请只输出一个 JSON 对象，不要 markdown 代码块，不要解释。",
        },
    ]);
    const retryParsed = parseJson<T>(retry);
    if (retryParsed !== undefined) return retryParsed;

    throw new AiError("AI 返回的格式不对，再试一次吧");
}

/** 设置页的「测试连接」：只发一个很短的问题 */
export async function testAiConnection(settings: AiSettings): Promise<void> {
    const url = chatEndpoint(settings.baseUrl);
    if (!url) throw new AiError("还没填 API 地址");
    const res = await fetch(url, {
        method: "POST",
        headers: headers(settings),
        body: JSON.stringify({
            model: settings.model.trim(),
            messages: [{ role: "user", content: "只回复：ok" }],
            stream: false,
            max_tokens: 8,
        }),
    });
    if (!res.ok) throw await readError(res);
    await res.json();
}
