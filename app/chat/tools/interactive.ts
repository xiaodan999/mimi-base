import type { SandboxFiles } from "@/app/chat/types";

import {
    askUserRequestFromArgs,
    expenseRequestFromArgs,
    resolveInteractiveToolResult,
    type ToolHooks,
} from "../tool-inputs";
import { requestUserInput } from "../user-input";
import type { ToolOutcome } from "./outcome";

export async function askUserTool(
    args: Record<string, unknown>,
    files: SandboxFiles,
    hooks: ToolHooks,
): Promise<ToolOutcome> {
    const request = askUserRequestFromArgs(args);
    if (!request) {
        return {
            result: { ok: false, error: "提问参数不完整" },
            files,
            isError: true,
        };
    }
    const answer = await requestUserInput({
        ...request,
        conversationId: hooks.conversationId,
    });
    const resolved = await resolveInteractiveToolResult(
        "ask_user",
        args,
        answer,
        hooks,
    );
    return { ...resolved, files };
}

export async function logExpenseTool(
    args: Record<string, unknown>,
    files: SandboxFiles,
    hooks: ToolHooks,
): Promise<ToolOutcome> {
    const request = expenseRequestFromArgs(args);
    if (!request) {
        return {
            result: {
                ok: false,
                error: "账目参数不对（品名 1-50 字，金额为正数）",
            },
            files,
            isError: true,
        };
    }
    // The write always goes through the confirm card; the user taps
    // 「记下」 before the record exists.
    const answer = await requestUserInput({
        ...request,
        conversationId: hooks.conversationId,
    });
    const resolved = await resolveInteractiveToolResult(
        "log_expense",
        args,
        answer,
        hooks,
    );
    return { ...resolved, files };
}
