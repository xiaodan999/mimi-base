/** 设置存储键。 */
export const AI_SETTINGS_KEY = "mimi:ai:v1";
export const LEGACY_SETTINGS_KEY = "mimi-study:ai:v1";

/**
 * 站点统一使用的模型。客户端只把它写进请求和缓存信封；真正转发时
 * pocketbase/ai-relay.ts 会用服务端的 OPENCODE_MODEL 覆盖它。
 */
export const AI_MODEL = "deepseek-v4.1-flash";
