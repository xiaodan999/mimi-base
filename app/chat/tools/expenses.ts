import type { SandboxFiles } from "@/app/chat/types";

import {
    type ExpensesToolResult,
    postTool,
    timezoneOffsetMinutes,
} from "../tools-server";
import type { ToolOutcome } from "./outcome";

export async function getExpensesTool(
    args: Record<string, unknown>,
    files: SandboxFiles,
): Promise<ToolOutcome> {
    try {
        const data = await postTool<ExpensesToolResult>("/tools/expenses", {
            ...(typeof args.from === "string"
                ? { from: args.from.trim() }
                : {}),
            ...(typeof args.to === "string" ? { to: args.to.trim() } : {}),
            tz: timezoneOffsetMinutes(),
        });
        if (!data.ok) {
            return {
                result: { ok: false, error: data.error ?? "账本读不了" },
                files,
                isError: true,
            };
        }
        return { result: data, files, isError: false };
    } catch (error) {
        return {
            result: {
                ok: false,
                error:
                    error instanceof Error ? error.message : "账本工具请求失败",
            },
            files,
            isError: true,
        };
    }
}
