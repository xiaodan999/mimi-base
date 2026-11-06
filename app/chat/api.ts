import pb from "@/lib/pb";

import type { ChatModel } from "./types";

/**
 * `/ai` is served by the Bun supervisor (see pocketbase/ai-relay.ts), not by
 * PocketBase. In dev Vite proxies it, so `pb.baseUrl` is always the right
 * origin — the same trick `app/ai/endpoint.ts` uses for the legacy features.
 */
export function aiUrl(path: string): string {
    const base = pb.baseUrl.replace(/\/+$/, "");
    return `${base}/ai${path.startsWith("/") ? path : `/${path}`}`;
}

export function chatHeaders(): Record<string, string> {
    const token = pb.authStore.token;
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: token } : {}),
        "X-Client": "mimi-base/1.0",
    };
}

export class ChatApiError extends Error {
    status: number;

    constructor(message: string, status = 0) {
        super(message);
        this.name = "ChatApiError";
        this.status = status;
    }
}

/** Read a relay error body without ever showing raw provider details. */
export async function readChatError(res: Response): Promise<ChatApiError> {
    let detail = "";
    try {
        const text = await res.text();
        try {
            const json = JSON.parse(text) as {
                error?: { message?: unknown } | string;
                message?: unknown;
            };
            const raw =
                typeof json.error === "string"
                    ? json.error
                    : (json.error?.message ?? json.message);
            if (typeof raw === "string") detail = raw;
        } catch {
            // proxy HTML pages stay hidden
        }
    } catch {
        // ignore
    }
    if (!detail) {
        if (res.status === 401 || res.status === 403) {
            detail = "登录已过期，请重新登录";
        } else if (res.status === 429) {
            detail = "请求太频繁或今天的额度用完了，歇一会儿再试";
        } else if (res.status >= 500) {
            detail = "AI 服务暂时不可用，稍后再试";
        } else {
            detail = `请求失败（HTTP ${res.status}）`;
        }
    }
    return new ChatApiError(detail.slice(0, 200), res.status);
}

function isChatModel(value: unknown): value is ChatModel {
    if (typeof value !== "object" || value === null) return false;
    const model = value as Record<string, unknown>;
    return (
        typeof model.id === "string" &&
        model.id.trim() !== "" &&
        typeof model.label === "string" &&
        typeof model.vision === "boolean" &&
        typeof model.tools === "boolean" &&
        typeof model.reasoning === "boolean"
    );
}

export type ChatModelList = {
    models: ChatModel[];
    defaultModel: string;
    keyConfigured: boolean;
};

/**
 * The server owns the allowlist; the picker only renders what comes back and
 * the relay rejects anything else.
 */
export async function fetchChatModels(
    signal?: AbortSignal,
): Promise<ChatModelList> {
    const res = await fetch(aiUrl("/models"), {
        method: "GET",
        headers: chatHeaders(),
        signal,
    });
    if (!res.ok) throw await readChatError(res);
    const json = (await res.json()) as {
        models?: unknown;
        defaultModel?: unknown;
        keyConfigured?: unknown;
    };
    const models = Array.isArray(json.models)
        ? json.models.filter(isChatModel).map((model) => ({
              ...model,
              thinkingLevels: Array.isArray(
                  (model as { thinkingLevels?: unknown }).thinkingLevels,
              )
                  ? (
                        model as { thinkingLevels: unknown[] }
                    ).thinkingLevels.filter(
                        (level): level is string => typeof level === "string",
                    )
                  : [],
          }))
        : [];
    const defaultModel =
        typeof json.defaultModel === "string" &&
        models.some((model) => model.id === json.defaultModel)
            ? json.defaultModel
            : (models[0]?.id ?? "");
    return {
        models,
        defaultModel,
        keyConfigured: json.keyConfigured === true,
    };
}
