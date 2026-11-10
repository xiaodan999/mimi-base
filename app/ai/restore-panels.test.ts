import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 回归测试：每个可关闭的 AI 面板都必须用 decideAiRestore 决定「重开时显示
 * 什么」，不许再各自手写一套 running/done/error + getResult/readAiCache 的
 * 优先级判断。源码扫描，改动面板时如果又抄回旧模式会直接挂掉。
 */
const ROOT = join(import.meta.dir, "..", "..");

const closablePanels = [
    "app/ai/AiPanel.tsx",
    "app/ai/AiCoachCard.tsx",
    "app/ai/AiVariantSheet.tsx",
    "app/ai/AiGradeSheet.tsx",
    "app/routes/_protected/_main/-home/memory-card.tsx",
    "app/routes/_protected/_main/jizhang/-components/ai-category-fix.tsx",
    "app/routes/_protected/_main/jizhang/-components/ai-expense-sheet.tsx",
    "app/routes/_protected/_main/report/index.tsx",
    "app/study/components/AiDrillSheet.tsx",
];

describe("可关闭的 AI 面板统一用 decideAiRestore", () => {
    for (const file of closablePanels) {
        test(`${file} 不手写恢复逻辑`, () => {
            const source = readFileSync(join(ROOT, file), "utf8");
            expect(source).toContain("decideAiRestore");
            // 「task.status === 'done' 后再 getResult/readAiCache」是被消灭的
            // 手写模式；running 的实时进度分支不算恢复决策，所以只禁 done。
            expect(source).not.toMatch(/status === ["']done["']/);
            // 首页卡片不该再自己 new AbortController 并在 unmount 时 abort。
            expect(source).not.toContain("new AbortController(");
        });
    }
});
