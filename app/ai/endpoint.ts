/**
 * AI 中转地址由 AiProvider 注入。
 *
 * 和 pb-token.ts 一样，client.ts 不能直接 import `@/lib/pb`：那个模块在
 * 加载时校验 VITE_POCKETBASE_URL，会让 bun test 里的 AI 单测崩掉。
 */
let provider: () => string = () => "";

export function setAiRelayBaseUrlProvider(getBaseUrl: () => string): void {
    provider = getBaseUrl;
}

export function getAiRelayBaseUrl(): string {
    try {
        return provider();
    } catch {
        return "";
    }
}
