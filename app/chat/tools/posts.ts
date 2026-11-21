import type { SandboxFiles } from "@/app/chat/types";

import { type PostsToolResult, postTool } from "../tools-server";
import type { ToolOutcome } from "./outcome";

export async function searchPostsTool(
    args: Record<string, unknown>,
    files: SandboxFiles,
): Promise<ToolOutcome> {
    try {
        const data = await postTool<PostsToolResult>("/tools/posts", {
            ...(typeof args.query === "string" && args.query.trim() !== ""
                ? { query: args.query.trim().slice(0, 80) }
                : {}),
            ...(typeof args.limit === "number" && Number.isFinite(args.limit)
                ? { limit: args.limit }
                : {}),
        });
        if (!data.ok) {
            return {
                result: { ok: false, error: data.error ?? "动态读不了" },
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
                    error instanceof Error ? error.message : "动态工具请求失败",
            },
            files,
            isError: true,
        };
    }
}
