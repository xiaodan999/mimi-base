import { normalizeChartSpec } from "./chart";
import { runSandbox } from "./sandbox";
import type { ChatToolDefinition } from "./stream";
import {
    askUserRequestFromArgs,
    expenseRequestFromArgs,
    resolveInteractiveToolResult,
    type ToolHooks,
} from "./tool-inputs";
import {
    postTool,
    timezoneOffsetMinutes,
    type ExpensesToolResult,
    type MemoryToolResult,
    type PostsToolResult,
    type ReadUrlToolResult,
} from "./tools-server";
import type { SandboxFiles } from "./types";
import { requestUserInput } from "./user-input";

// The pausable-tool logic lives in ./tool-inputs (pure, unit-testable);
// re-exported here so the tool-loop API stays in one place.
export {
    askUserRequestFromArgs,
    expenseRequestFromArgs,
    isInteractiveTool,
    pendingRequestFromToolCall,
    resolveInteractiveToolResult,
} from "./tool-inputs";
export type { ToolHooks } from "./tool-inputs";

/**
 * Tools the chat model may call. Code runs in the server-side Docker sandbox
 * (public HTTP(S) only); data tools hit `/ai/tools/*`, where the server
 * enforces auth, scoping and limits — the browser just forwards arguments.
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
    {
        type: "function",
        function: {
            name: "ask_user",
            description:
                "向用户发起一个交互式请求并等待回答。缺少必要信息（城市、偏好、单位等）或需要用户授权（定位）时使用；一次只问一件事，不要问对话里已经有的信息。kind=text 让用户输入文字，choice 让用户从 options 里选，confirm 让用户确认，location 请求浏览器定位（会弹出授权）。",
            parameters: {
                type: "object",
                properties: {
                    question: {
                        type: "string",
                        description: "显示给用户的问题，要具体、简短",
                    },
                    kind: {
                        type: "string",
                        enum: ["text", "choice", "confirm", "location"],
                    },
                    options: {
                        type: "array",
                        items: { type: "string" },
                        description: "kind=choice 时的选项（2-6 个）",
                    },
                    placeholder: {
                        type: "string",
                        description: "文字输入框的提示",
                    },
                },
                required: ["question", "kind"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "show_chart",
            description:
                "把一组数据画成图表显示给用户（柱状图/折线图/饼图）。用户想看趋势、对比或占比时使用；labels 和 values 必须一一对应（最多 30 项），不要用它显示表格类数据。一次只画一张图。",
            parameters: {
                type: "object",
                properties: {
                    type: {
                        type: "string",
                        enum: ["bar", "line", "pie"],
                        description:
                            "bar=柱状图（对比），line=折线图（趋势），pie=饼图（占比）",
                    },
                    title: {
                        type: "string",
                        description: "图表标题，简短",
                    },
                    labels: {
                        type: "array",
                        items: { type: "string" },
                        description: "每个数据点的名称（如分类名、日期）",
                    },
                    values: {
                        type: "array",
                        items: { type: "number" },
                        description: "与 labels 一一对应的数值",
                    },
                    unit: {
                        type: "string",
                        description: "数值单位（如 元、次），可省略",
                    },
                },
                required: ["type", "title", "labels", "values"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "memory",
            description:
                "记住或查询用户的长期信息（忌口、习惯、称呼、偏好等），之后每次聊天都会带上。action=save 保存一条（content 一句话，50 字内最好）；action=list 查看已有哪些；action=delete 删除某条（要 id，通常先 list）。用户说「记住…」时用它；琐碎或一次性的信息不要存。",
            parameters: {
                type: "object",
                properties: {
                    action: {
                        type: "string",
                        enum: ["save", "list", "delete"],
                    },
                    content: {
                        type: "string",
                        description: "action=save 时要记的内容",
                    },
                    id: {
                        type: "string",
                        description: "action=delete 时要删除的记忆 id",
                    },
                },
                required: ["action"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "read_url",
            description:
                "读取一个网页链接的正文（自动剥离 HTML）。用户贴了链接、或回答需要引用某个具体网页时使用；只能读公网 http/https 文本页面。",
            parameters: {
                type: "object",
                properties: {
                    url: {
                        type: "string",
                        description: "完整的网页地址",
                    },
                },
                required: ["url"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_expenses",
            description:
                "查询共享账本的流水和分类汇总（两个人的账都在里面）。from/to 是 YYYY-MM-DD，省略时默认本月。适合「这个月花了多少」「最近吃饭花了多少」这类问题；要把结果画出来就用 show_chart。",
            parameters: {
                type: "object",
                properties: {
                    from: {
                        type: "string",
                        description: "开始日期 YYYY-MM-DD（含）",
                    },
                    to: {
                        type: "string",
                        description: "结束日期 YYYY-MM-DD（含）",
                    },
                },
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "search_posts",
            description:
                "搜索或浏览共享动态（两个人发的帖子都在里面）。query 是关键词（可省略=最近发布）；适合「我们去过哪里」「之前说过什么」这类回忆型问题。",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "关键词，可省略",
                    },
                    limit: {
                        type: "number",
                        description: "条数（1-30，默认 20）",
                    },
                },
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "log_expense",
            description:
                "帮用户记一笔账。必须先和用户确认品名和金额；调用后会弹出确认卡片，用户点「记下」才真正写入，取消则不记。category 可省略。",
            parameters: {
                type: "object",
                properties: {
                    item: {
                        type: "string",
                        description: "品名，如 午饭、电影票",
                    },
                    price: {
                        type: "number",
                        description: "金额（正数）",
                    },
                    category: {
                        type: "string",
                        description: "分类，可省略",
                    },
                },
                required: ["item", "price"],
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
    hooks: ToolHooks = {},
): Promise<ChatToolOutcome> {
    const args = parseArgs(argsText);
    if (!args) {
        return {
            result: { ok: false, error: "工具参数不是合法的 JSON" },
            files,
            isError: true,
        };
    }

    if (name === "ask_user") {
        const request = askUserRequestFromArgs(args);
        if (!request) {
            return {
                result: { ok: false, error: "提问参数不完整" },
                files,
                isError: true,
            };
        }
        const answer = await requestUserInput(request);
        const resolved = await resolveInteractiveToolResult(
            name,
            args,
            answer,
            hooks,
        );
        return { ...resolved, files };
    }

    if (name === "show_chart") {
        const spec = normalizeChartSpec(args);
        if (!spec) {
            return {
                result: {
                    ok: false,
                    error: "图表数据不对：labels 和 values 必须一一对应（1-30 项）",
                },
                files,
                isError: true,
            };
        }
        // The card renders from the normalized spec (args or result survive a
        // reload); the result mirrors it so the model sees what was drawn.
        return { result: { ok: true, ...spec }, files, isError: false };
    }

    if (name === "memory") {
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
            const data = await postTool<MemoryToolResult>(
                "/tools/memory",
                body,
            );
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
                        error instanceof Error
                            ? error.message
                            : "记忆工具请求失败",
                },
                files,
                isError: true,
            };
        }
    }

    if (name === "read_url") {
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
                    error:
                        error instanceof Error ? error.message : "网页读取失败",
                },
                files,
                isError: true,
            };
        }
    }

    if (name === "get_expenses") {
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
                        error instanceof Error
                            ? error.message
                            : "账本工具请求失败",
                },
                files,
                isError: true,
            };
        }
    }

    if (name === "search_posts") {
        try {
            const data = await postTool<PostsToolResult>("/tools/posts", {
                ...(typeof args.query === "string" && args.query.trim() !== ""
                    ? { query: args.query.trim().slice(0, 80) }
                    : {}),
                ...(typeof args.limit === "number" &&
                Number.isFinite(args.limit)
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
                        error instanceof Error
                            ? error.message
                            : "动态工具请求失败",
                },
                files,
                isError: true,
            };
        }
    }

    if (name === "log_expense") {
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
        const answer = await requestUserInput(request);
        const resolved = await resolveInteractiveToolResult(
            name,
            args,
            answer,
            hooks,
        );
        return { ...resolved, files };
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
