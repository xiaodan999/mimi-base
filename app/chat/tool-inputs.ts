import {
    normalizeSandboxPath,
    type SandboxArtifact,
} from "@/lib/sandbox-protocol";

import type { ChatArtifactPart } from "./types";
import type {
    UserInputAnswer,
    UserInputKind,
    UserInputRequest,
} from "./user-input";

/**
 * Pure logic for the tools that pause the loop waiting for user input
 * (`ask_user`, `log_expense`). Nothing here imports PocketBase or any other
 * environment-bearing module, so it is unit-testable as-is — the expense
 * write arrives as an injected function (see `ToolHooks`) instead of the pb
 * singleton, which is what keeps `lib/env.ts` out of this module's graph.
 *
 * Shared by the live tool loop (`executeChatTool`) and the reload-resume
 * path, so both produce identical tool results.
 */

/** Side effects and injected writes the caller (session hook) provides. */
export type ToolHooks = {
    /** Conversation that owns the run; scopes any user question to it. */
    conversationId?: string;
    /**
     * Creates the confirmed expense row. Owned by the chat data layer
     * (`useChatActions`), which also invalidates the 记账 queries.
     */
    createExpense?: (input: {
        item: string;
        price: number;
        category: string;
    }) => Promise<{ id: string }>;
    /** The `memory` tool changed saved memories; refresh the injected set. */
    onMemoryChanged?: () => void;
    /**
     * Uploads a binary image produced by the sandbox to `chat_artifacts`.
     * Injected because it needs PocketBase; the returned part is appended to
     * the assistant message by the tool loop.
     */
    saveArtifact?: (input: {
        artifact: SandboxArtifact;
        caption?: string;
    }) => Promise<ChatArtifactPart>;
};

export type SendFileRequest = {
    path: string;
    caption: string;
};

/** Validate `send_file` args (the file must also exist in the snapshot). */
export function sendFileRequestFromArgs(
    args: Record<string, unknown>,
): SendFileRequest | null {
    const path = normalizeSandboxPath(args.path);
    if (!path) return null;
    return {
        path,
        caption:
            typeof args.caption === "string"
                ? args.caption.trim().slice(0, 200)
                : "",
    };
}

/** Validate streamed `ask_user` args into a panel request, or null. */
export function askUserRequestFromArgs(
    args: Record<string, unknown>,
): UserInputRequest | null {
    const question =
        typeof args.question === "string" ? args.question.trim() : "";
    const kind = args.kind as UserInputKind;
    if (question === "") return null;
    if (
        kind !== "text" &&
        kind !== "choice" &&
        kind !== "confirm" &&
        kind !== "location"
    ) {
        return null;
    }
    const options = Array.isArray(args.options)
        ? args.options
              .filter((option): option is string => typeof option === "string")
              .map((option) => option.trim().slice(0, 80))
              .filter((option) => option !== "")
              .slice(0, 6)
        : undefined;
    if (kind === "choice" && (!options || options.length < 2)) return null;
    return {
        question: question.slice(0, 300),
        kind,
        ...(kind === "choice" ? { options } : {}),
        ...(typeof args.placeholder === "string" &&
        args.placeholder.trim() !== ""
            ? { placeholder: args.placeholder.trim().slice(0, 80) }
            : {}),
    };
}

/** Validate streamed `log_expense` args into a confirm-card request, or null. */
export function expenseRequestFromArgs(
    args: Record<string, unknown>,
): UserInputRequest | null {
    const item = typeof args.item === "string" ? args.item.trim() : "";
    const price =
        typeof args.price === "number" && Number.isFinite(args.price)
            ? Math.round(args.price * 100) / 100
            : Number.NaN;
    const category =
        typeof args.category === "string"
            ? args.category.trim().slice(0, 40)
            : "";
    if (item === "" || item.length > 50) return null;
    if (!Number.isFinite(price) || price <= 0 || price > 10_000_000)
        return null;
    return {
        question: "记下这一笔？",
        kind: "expense",
        expense: { item, price, category },
    };
}

/**
 * Rebuild a panel request from a persisted tool-call part, so a question that
 * was waiting when the page reloaded can be asked again.
 */
export function pendingRequestFromToolCall(
    toolName: string,
    argsText: string,
): UserInputRequest | null {
    let args: Record<string, unknown>;
    try {
        const parsed = JSON.parse(argsText) as unknown;
        if (
            typeof parsed !== "object" ||
            parsed === null ||
            Array.isArray(parsed)
        ) {
            return null;
        }
        args = parsed as Record<string, unknown>;
    } catch {
        return null;
    }
    if (toolName === "ask_user") return askUserRequestFromArgs(args);
    if (toolName === "log_expense") return expenseRequestFromArgs(args);
    return null;
}

/**
 * Map the user's answer to the tool result the model receives.
 */
export async function resolveInteractiveToolResult(
    toolName: string,
    args: Record<string, unknown>,
    answer: UserInputAnswer,
    hooks: ToolHooks = {},
): Promise<{ result: unknown; isError: boolean }> {
    if (!answer.ok) {
        return { result: { ok: false, error: answer.error }, isError: true };
    }

    if (toolName === "ask_user") {
        const kind = args.kind as UserInputKind;
        if (kind === "location" && answer.location) {
            return {
                result: { ok: true, kind, ...answer.location },
                isError: false,
            };
        }
        return {
            result: { ok: true, kind, answer: answer.answer ?? "" },
            isError: false,
        };
    }

    if (toolName === "log_expense") {
        const request = expenseRequestFromArgs(args);
        if (!request?.expense) {
            return {
                result: { ok: false, error: "账目参数不对" },
                isError: true,
            };
        }
        const { item, price, category } = request.expense;
        const createExpense = hooks.createExpense;
        if (!createExpense) {
            return {
                result: { ok: false, error: "记账功能不可用" },
                isError: true,
            };
        }
        try {
            const { id } = await createExpense({ item, price, category });
            return {
                result: {
                    ok: true,
                    saved: true,
                    id,
                    item,
                    price,
                    category,
                },
                isError: false,
            };
        } catch {
            return {
                result: { ok: false, error: "记账写入失败，请重试" },
                isError: true,
            };
        }
    }

    return {
        result: { ok: false, error: `未知工具：${toolName}` },
        isError: true,
    };
}

/** Tools that pause the loop waiting for user input (resume-able). */
export function isInteractiveTool(toolName: string): boolean {
    return toolName === "ask_user" || toolName === "log_expense";
}
