import type { SandboxFiles } from "@/app/chat/types";

import {
    changedPaths,
    isBinaryArtifactPath,
    sandboxArtifactPart,
    textArtifactInfo,
} from "../artifacts";
import { runSandbox } from "../sandbox";
import { sendFileRequestFromArgs, type ToolHooks } from "../tool-inputs";
import type { ChatArtifactPart } from "../types";
import type { ToolOutcome } from "./outcome";

/** sandbox_run / read / write / list, plus saving the produced artifacts. */
export async function runSandboxTool(
    name: string,
    args: Record<string, unknown>,
    files: SandboxFiles,
    hooks: ToolHooks,
): Promise<ToolOutcome> {
    let response: Awaited<ReturnType<typeof runSandbox>>;
    switch (name) {
        case "sandbox_run":
            response = await runSandbox({
                op: "run",
                code: typeof args.code === "string" ? args.code : "",
                files,
            });
            break;
        case "sandbox_read":
            response = await runSandbox({
                op: "read",
                path: typeof args.path === "string" ? args.path : "",
                files,
            });
            break;
        case "sandbox_write":
            response = await runSandbox({
                op: "write",
                path: typeof args.path === "string" ? args.path : "",
                content: typeof args.content === "string" ? args.content : "",
                append: args.append === true,
                files,
            });
            break;
        case "sandbox_list":
            response = await runSandbox({ op: "list", files });
            break;
        default:
            return {
                result: { ok: false, error: `未知工具：${name}` },
                files,
                isError: true,
            };
    }

    const changed = changedPaths(files, response.files);
    const artifactParts: ChatArtifactPart[] = [];
    let artifactError = "";
    for (const artifact of response.artifacts) {
        if (!hooks.saveArtifact) continue;
        try {
            artifactParts.push(await hooks.saveArtifact({ artifact }));
        } catch (error) {
            artifactError =
                error instanceof Error
                    ? error.message
                    : "图片保存失败，刷新后可能看不到";
        }
    }

    return {
        result: {
            ok: response.ok,
            result: response.result ?? null,
            logs: response.logs,
            files: Object.keys(response.files).sort(),
            changed,
            ...(response.artifacts.length > 0
                ? {
                      artifacts: response.artifacts.map((artifact) => ({
                          path: artifact.path,
                          mime: artifact.mime,
                          bytes: artifact.bytes,
                      })),
                  }
                : {}),
            ...(artifactError ? { artifact_error: artifactError } : {}),
            ...(response.error ? { error: response.error } : {}),
        },
        files: response.files,
        isError: !response.ok,
        ...(artifactParts.length > 0 ? { artifacts: artifactParts } : {}),
    };
}

/** The names handled above; anything else falls through to the unknown error. */
export const SANDBOX_TOOL_NAMES = new Set([
    "sandbox_run",
    "sandbox_read",
    "sandbox_write",
    "sandbox_list",
]);

/** send_file reads the sandbox map but is otherwise interactive (no run). */
export function sendFileTool(
    args: Record<string, unknown>,
    files: SandboxFiles,
): ToolOutcome {
    const request = sendFileRequestFromArgs(args);
    if (!request) {
        return {
            result: {
                ok: false,
                error: "文件路径不对（必须是沙箱里的相对路径）",
            },
            files,
            isError: true,
        };
    }
    const path = request.path;
    if (isBinaryArtifactPath(path)) {
        return {
            result: {
                ok: false,
                error: "图片生成时会自动显示，不需要 send_file",
            },
            files,
            isError: true,
        };
    }
    const content = files[path];
    if (content === undefined) {
        return {
            result: {
                ok: false,
                error: "沙箱里没有这个文件，先用 sandbox_write 写出来",
            },
            files,
            isError: true,
        };
    }
    if (content === "") {
        return {
            result: { ok: false, error: "这个文件是空的" },
            files,
            isError: true,
        };
    }
    const info = textArtifactInfo(path);
    return {
        result: {
            ok: true,
            sent: true,
            path,
            name: info.name,
            kind: info.kind,
            mime: info.mime,
            ...(request.caption ? { caption: request.caption } : {}),
        },
        files,
        isError: false,
        artifacts: [sandboxArtifactPart(path, request.caption || undefined)],
    };
}
