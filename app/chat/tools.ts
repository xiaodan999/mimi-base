import { runSandbox } from "./sandbox";
import type { ChatToolDefinition } from "./stream";
import type { SandboxFiles } from "./types";

/**
 * Tools the chat model may call. All of them run inside the isolated sandbox
 * worker; the conversation's file snapshot is the only shared state.
 */
export const SANDBOX_TOOLS: readonly ChatToolDefinition[] = [
    {
        type: "function",
        function: {
            name: "sandbox_run",
            description:
                "在隔离沙箱里运行一段 JavaScript（不支持网络）。可以用 sandbox.read(path)、sandbox.write(path, text)、sandbox.list()、sandbox.remove(path) 读写本次对话的文件；支持 async/await，返回值会作为结果返回。适合计算、处理文本/JSON、验证代码。",
            parameters: {
                type: "object",
                properties: {
                    code: {
                        type: "string",
                        description:
                            "要执行的 JavaScript 源码。用 console.log 输出中间结果，最后 return 结果。",
                    },
                },
                required: ["code"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "sandbox_read",
            description: "读取本次对话沙箱里的一个文本文件。",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "相对路径，例如 notes.md",
                    },
                },
                required: ["path"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "sandbox_write",
            description:
                "把一段文本写入本次对话沙箱里的文件（会覆盖同名文件）。",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "相对路径" },
                    content: {
                        type: "string",
                        description: "完整的文件内容",
                    },
                },
                required: ["path", "content"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "sandbox_list",
            description: "列出本次对话沙箱里的文件路径。",
            parameters: {
                type: "object",
                properties: {},
                additionalProperties: false,
            },
        },
    },
];

export function toolsForModel(model: { tools: boolean }): ChatToolDefinition[] {
    return model.tools ? [...SANDBOX_TOOLS] : [];
}

export type ChatToolOutcome = {
    /** JSON-safe summary sent back to the model and stored on the part. */
    result: unknown;
    files: SandboxFiles;
    isError: boolean;
};

function parseArgs(argsText: string): Record<string, unknown> | null {
    try {
        const parsed = JSON.parse(argsText) as unknown;
        return typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}

export async function executeChatTool(
    name: string,
    argsText: string,
    files: SandboxFiles,
): Promise<ChatToolOutcome> {
    const args = parseArgs(argsText);
    if (!args) {
        return {
            result: { ok: false, error: "工具参数不是合法的 JSON" },
            files,
            isError: true,
        };
    }

    let response;
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

    return {
        result: {
            ok: response.ok,
            result: response.result ?? null,
            logs: response.logs,
            files: Object.keys(response.files).sort(),
            ...(response.error ? { error: response.error } : {}),
        },
        files: response.files,
        isError: !response.ok,
    };
}
