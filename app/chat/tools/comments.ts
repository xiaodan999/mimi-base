import type { SandboxFiles } from "@/app/chat/types";
import { isRecordId } from "@/lib/chat-files";

import { type CommentsToolResult, postTool } from "../tools-server";
import type { ToolOutcome } from "./outcome";

export async function getCommentsTool(
    args: Record<string, unknown>,
    files: SandboxFiles,
): Promise<ToolOutcome> {
    const postId = typeof args.post_id === "string" ? args.post_id.trim() : "";
    // A guessed id would just return an empty list; fail fast with the
    // corrective hint so the next round can call search_posts first.
    if (postId !== "" && !isRecordId(postId)) {
        return {
            result: {
                ok: false,
                error: "post_id 不是动态记录 id：可先用 search_posts 查到动态 id 再筛选",
            },
            files,
            isError: true,
        };
    }
    try {
        const data = await postTool<CommentsToolResult>("/tools/comments", {
            ...(postId !== "" ? { post_id: postId } : {}),
            ...(typeof args.query === "string" && args.query.trim() !== ""
                ? { query: args.query.trim().slice(0, 60) }
                : {}),
            ...(typeof args.author === "string" && args.author.trim() !== ""
                ? { author: args.author.trim().slice(0, 40) }
                : {}),
            ...(typeof args.limit === "number" && Number.isFinite(args.limit)
                ? { limit: args.limit }
                : {}),
        });
        if (!data.ok) {
            return {
                result: { ok: false, error: data.error ?? "评论读不了" },
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
                    error instanceof Error ? error.message : "评论工具请求失败",
            },
            files,
            isError: true,
        };
    }
}
