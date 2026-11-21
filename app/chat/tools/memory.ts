import type { SandboxFiles } from "@/app/chat/types";

import type { ToolHooks } from "../tool-inputs";
import { type MemoryToolResult, postTool } from "../tools-server";
import type { ToolOutcome } from "./outcome";

export async function memoryTool(
    args: Record<string, unknown>,
    files: SandboxFiles,
    hooks: ToolHooks,
): Promise<ToolOutcome> {
    const action = args.action;
    const body: Record<string, unknown> = { action };
    if (typeof args.content === "string") {
        body.content = args.content.trim().slice(0, 500);
    }
    if (typeof args.id === "string") body.id = args.id.trim();
    if (
        (action === "save" &&
            (typeof body.content !== "string" || body.content === "")) ||
        (action === "delete" && typeof body.id !== "string")
    ) {
        return {
            result: { ok: false, error: "缺少记忆内容或要删除的 id" },
            files,
            isError: true,
        };
    }
    try {
        const data = await postTool<MemoryToolResult>("/tools/memory", body);
        if (!data.ok) {
            return {
                result: { ok: false, error: data.error ?? "记忆操作失败" },
                files,
                isError: true,
            };
        }
        hooks.onMemoryChanged?.();
        return {
            result: data.items
                ? {
                      ok: true,
                      action,
                      memories: data.items,
                  }
                : { ...data, action },
            files,
            isError: false,
        };
    } catch (error) {
        return {
            result: {
                ok: false,
                error:
                    error instanceof Error ? error.message : "记忆工具请求失败",
            },
            files,
            isError: true,
        };
    }
}
