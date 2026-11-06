/**
 * 本机 token / 花费统计与「每日预算上限」。
 *
 * 只记在 localStorage，纯前端估算，不保证和账单一致；目的是给 BYOK 用户
 * 一个看得见的开销上限，避免某个后台任务失控一直花钱。
 */

import type { AiSettings } from "./config";

export type AiUsage = {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
};

export type DailyUsage = {
    date: string;
    costUsd: number;
    tokens: number;
    calls: number;
};

/** 每百万 token 的美元单价（输入 / 输出）；命中不到就用一个保守均价。 */
const PRICING: { match: RegExp; input: number; output: number }[] = [
    { match: /deepseek/i, input: 0.28, output: 0.42 },
    { match: /gpt-4o-mini/i, input: 0.15, output: 0.6 },
    { match: /gpt-4o/i, input: 2.5, output: 10 },
    { match: /qwen/i, input: 0.15, output: 0.6 },
    { match: /moonshot/i, input: 1.7, output: 1.7 },
    { match: /claude/i, input: 3, output: 15 },
    { match: /llama|mistral|gemini/i, input: 0.2, output: 0.6 },
];
const DEFAULT_PRICE = { input: 1, output: 1 };

const USAGE_KEY = "mimi:ai-usage:v1";

/** 本地日期（YYYY-MM-DD）。用 UTC 的话，UTC+8 的额度要到早上 8 点才归零。 */
function today(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
}

function emptyDay(): DailyUsage {
    return { date: today(), costUsd: 0, tokens: 0, calls: 0 };
}

export function priceFor(model: string): { input: number; output: number } {
    return PRICING.find((entry) => entry.match.test(model)) ?? DEFAULT_PRICE;
}

export function estimateCostUsd(model: string, usage: AiUsage): number {
    const price = priceFor(model);
    const cost =
        (usage.promptTokens / 1_000_000) * price.input +
        (usage.completionTokens / 1_000_000) * price.output;
    return Number.isFinite(cost) && cost > 0 ? cost : 0;
}

/** 读今天的累计；跨天自动归零（不写库，读时判断即可）。 */
export function readDailyUsage(): DailyUsage {
    if (typeof window === "undefined") return emptyDay();
    try {
        const raw = localStorage.getItem(USAGE_KEY);
        if (!raw) return emptyDay();
        const parsed = JSON.parse(raw) as Partial<DailyUsage>;
        if (parsed.date !== today()) return emptyDay();
        return {
            date: today(),
            costUsd: typeof parsed.costUsd === "number" ? parsed.costUsd : 0,
            tokens: typeof parsed.tokens === "number" ? parsed.tokens : 0,
            calls: typeof parsed.calls === "number" ? parsed.calls : 0,
        };
    } catch {
        return emptyDay();
    }
}

export function recordUsage(model: string, usage: AiUsage) {
    if (typeof window === "undefined") return;
    try {
        const current = readDailyUsage();
        const next: DailyUsage = {
            date: today(),
            costUsd: current.costUsd + estimateCostUsd(model, usage),
            tokens: current.tokens + (usage.totalTokens || 0),
            calls: current.calls + 1,
        };
        localStorage.setItem(USAGE_KEY, JSON.stringify(next));
    } catch {
        // 隐私模式下写不进去，忽略即可
    }
}

/** dailyBudgetUsd <= 0 表示不限制。 */
export function isOverBudget(settings: AiSettings): boolean {
    const budget = settings.dailyBudgetUsd ?? 0;
    if (budget <= 0) return false;
    return readDailyUsage().costUsd >= budget;
}

export function formatUsd(value: number): string {
    if (value <= 0) return "$0";
    if (value < 0.01) return "<$0.01";
    return `$${value.toFixed(2)}`;
}
