import type { SandboxFiles } from "@/app/chat/types";

import { postTool, type ReadUrlToolResult } from "../tools-server";
import type { ToolOutcome } from "./outcome";

export async function readUrlTool(
    args: Record<string, unknown>,
    files: SandboxFiles,
): Promise<ToolOutcome> {
    const url = typeof args.url === "string" ? args.url.trim() : "";
    if (url === "") {
        return {
            result: { ok: false, error: "缺少要读取的网址" },
            files,
            isError: true,
        };
    }
    try {
        const data = await postTool<ReadUrlToolResult>("/tools/url", {
            url,
        });
        if (!data.ok) {
            return {
                result: {
                    ok: false,
                    url,
                    error: data.error ?? "网页读不了",
                },
                files,
                isError: true,
            };
        }
        return { result: data, files, isError: false };
    } catch (error) {
        return {
            result: {
                ok: false,
                url,
                error: error instanceof Error ? error.message : "网页读取失败",
            },
            files,
            isError: true,
        };
    }
}
