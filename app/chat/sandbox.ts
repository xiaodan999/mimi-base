import {
    sanitizeFiles,
    type SandboxRequest,
    type SandboxResponse,
} from "@/lib/sandbox-protocol";

import { aiUrl, chatHeaders, readChatError } from "./api";

/**
 * Runs the code in the server-side Docker sandbox (`/ai/sandbox`). The
 * browser only sends the operation and the conversation's file snapshot;
 * execution and network filtering happen on the server.
 */
export async function runSandbox(
    input: SandboxRequest,
): Promise<SandboxResponse> {
    const files = sanitizeFiles(input.files);
    try {
        const res = await fetch(aiUrl("/sandbox"), {
            method: "POST",
            headers: chatHeaders(),
            body: JSON.stringify({ ...input, files }),
        });
        if (!res.ok) {
            const error = await readChatError(res);
            return {
                ok: false,
                error: error.message,
                logs: [],
                files,
                durationMs: 0,
            };
        }
        const data = (await res.json()) as Partial<SandboxResponse>;
        return {
            ok: data.ok === true,
            result: data.result,
            logs: Array.isArray(data.logs)
                ? data.logs.filter(
                      (line): line is string => typeof line === "string",
                  )
                : [],
            files: sanitizeFiles(data.files),
            ...(typeof data.error === "string" && data.error !== ""
                ? { error: data.error }
                : {}),
            durationMs:
                typeof data.durationMs === "number" &&
                Number.isFinite(data.durationMs)
                    ? data.durationMs
                    : 0,
        };
    } catch (error) {
        return {
            ok: false,
            error:
                error instanceof TypeError
                    ? "沙箱请求没发出去，检查网络后再试"
                    : error instanceof Error
                      ? error.message
                      : "沙箱请求失败",
            logs: [],
            files,
            durationMs: 0,
        };
    }
}
