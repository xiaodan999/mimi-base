import { runSandbox } from "./sandbox";
import type { ChatToolDefinition } from "./stream";
import type { SandboxFiles } from "./types";

/**
 * Tools the chat model may call. All of them run inside the server-side
 * Docker sandbox; the conversation's file snapshot is the only shared state.
 * Network access is limited to public HTTP(S) by the container network.
 */
export const SANDBOX_TOOLS: readonly ChatToolDefinition[] = [
    {
        type: "function",
        function: {
            name: "sandbox_run",
            description:
                "在服务器的隔离沙箱里运行代码，可选 Python 3（标准库）或 JavaScript（Node）。两者都能访问公网 HTTP/HTTPS（天气 API、网页、公开接口），但不能访问本站内网、PocketBase 或读取本站文件/密钥。用 sandbox.read(path)、sandbox.write(path, text)、sandbox.list()、sandbox.remove(path) 读写本次对话的文件；用 sandbox.fetch(url) 抓取网页/接口。Python 用 print 输出、把最终结果赋给 result；JavaScript 用 console.log 输出、用 return 返回结果。适合查实时信息、计算、处理文本/JSON、验证代码。",
            parameters: {
                type: "object",
                properties: {
                    language: {
                        type: "string",
                        enum: ["python", "javascript"],
                        description: "使用哪种语言运行",
                    },
                    code: {
                        type: "string",
                        description:
                            "要执行的源码。Python 用 print/result；JavaScript 用 console.log/return。",
                    },
                },
                required: ["language", "code"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "sandbox_read",
            description: "读取本次对话沙箱里的一个文本文件（Python 沙箱）。",
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
                language:
                    args.language === "javascript" ? "javascript" : "python",
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
