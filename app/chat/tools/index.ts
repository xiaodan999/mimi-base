import { parseToolArgs } from "../tool-args";
import type { ToolHooks } from "../tool-inputs";
import type { SandboxFiles } from "../types";
import { readAttachmentTool } from "./attachments";
import { getCommentsTool } from "./comments";
import { getExpensesTool } from "./expenses";
import { askUserTool, logExpenseTool } from "./interactive";
import { memoryTool } from "./memory";
import type { ChatToolOutcome, ToolOutcome } from "./outcome";
import { searchPostsTool } from "./posts";
import { runSandboxTool, SANDBOX_TOOL_NAMES, sendFileTool } from "./sandbox";
import { renderUiTool, showChartTool } from "./ui";
import { readUrlTool } from "./url";

// The pausable-tool logic lives in ../tool-inputs (pure, unit-testable);
// re-exported here so the tool-loop API stays in one place.
export {
    isInteractiveTool,
    pendingRequestFromToolCall,
    resolveInteractiveToolResult,
} from "../tool-inputs";
export type { ToolHooks } from "../tool-inputs";
export type { ChatToolOutcome } from "./outcome";
export { SANDBOX_TOOLS, toolsForModel } from "./registry";

type ToolHandler = (
    args: Record<string, unknown>,
    files: SandboxFiles,
    hooks: ToolHooks,
) => ToolOutcome | Promise<ToolOutcome>;

const HANDLERS: Record<string, ToolHandler> = {
    ask_user: askUserTool,
    show_chart: showChartTool,
    render_ui: renderUiTool,
    memory: memoryTool,
    read_url: readUrlTool,
    read_attachment: readAttachmentTool,
    get_expenses: getExpensesTool,
    search_posts: searchPostsTool,
    get_comments: getCommentsTool,
    log_expense: logExpenseTool,
    send_file: sendFileTool,
};

export async function executeChatTool(
    name: string,
    argsText: string,
    files: SandboxFiles,
    hooks: ToolHooks = {},
    opts: { truncated?: boolean } = {},
): Promise<ChatToolOutcome> {
    const args = parseToolArgs(argsText, { closeTail: !opts.truncated });
    if (!args) {
        return {
            result: {
                ok: false,
                error: opts.truncated
                    ? name === "sandbox_write"
                        ? "输出达到长度上限被截断了，这次没有写入：把内容拆成几段，第一段用 sandbox_write，之后每段带 append=true 续写到同一个文件，写完再 send_file"
                        : "输出达到长度上限被截断了：把要写的内容缩短，或分几次调用"
                    : "工具参数不是合法的 JSON",
            },
            files,
            isError: true,
        };
    }
    // Persist the canonical form so later rounds (and reloads) replay valid
    // JSON to the provider even when the streamed text was malformed.
    const canonicalArgsText = JSON.stringify(args);
    const outcome = await runChatTool(name, args, files, hooks);
    return { ...outcome, argsText: canonicalArgsText };
}

async function runChatTool(
    name: string,
    args: Record<string, unknown>,
    files: SandboxFiles,
    hooks: ToolHooks,
): Promise<ToolOutcome> {
    if (SANDBOX_TOOL_NAMES.has(name)) {
        return runSandboxTool(name, args, files, hooks);
    }
    const handler = HANDLERS[name];
    if (!handler) {
        return {
            result: { ok: false, error: `未知工具：${name}` },
            files,
            isError: true,
        };
    }
    return handler(args, files, hooks);
}
