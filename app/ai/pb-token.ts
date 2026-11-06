/**
 * PocketBase 认证令牌由 AiProvider 注入。
 *
 * 不让 client.ts 直接 import `@/lib/pb`：那个模块加载时会校验
 * VITE_POCKETBASE_URL，而 bun test 环境没有这个变量，会让 app/ai 的单元测试崩掉。
 */
let provider: () => string = () => "";

export function setAiAuthTokenProvider(getToken: () => string): void {
    provider = getToken;
}

export function getAiAuthToken(): string {
    try {
        return provider();
    } catch {
        return "";
    }
}
