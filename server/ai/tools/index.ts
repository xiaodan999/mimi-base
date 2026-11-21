/**
 * Server-side data tools for the general chat.
 *
 * The browser executes tools client-side (app/chat/tools.ts) and forwards
 * these calls here, authenticated with the caller's PocketBase token. The
 * relay (`server/ai/relay.ts`) owns auth, rate limits and quotas; this module
 * owns the tool semantics and dispatches to one module per tool.
 *
 * Security policy for every endpoint:
 * - Scope is enforced here with explicit PB filters, never assumed. The
 *   ledger (`ji_zhang_biao`), feed (`posts`) and their comments (`comments`)
 *   are deliberately shared between the two accounts, matching the app's own
 *   screens; memories are strictly owner-scoped (PB rules are the backstop).
 * - `read_url` resolves DNS and refuses private/reserved addresses, follows
 *   only validated redirects, caps size and time, and strips HTML to text.
 * - Tool-level failures come back as `200 {ok:false}` so the model can react;
 *   only malformed requests or infrastructure failures get 4xx/5xx.
 */

import { logger } from "../../http/logger";
import { createPbClient, type PbClient } from "../../http/pb";
import { comments } from "./comments";
import { expenses } from "./expenses";
import { memory } from "./memory";
import { posts } from "./posts";
import type { AiToolsCall, AiToolsResult, ToolHandler } from "./types";
import { readUrl } from "./url";

export const AI_TOOLS_EXPENSES_PATH = "/api/ai/tools/expenses";
export const AI_TOOLS_POSTS_PATH = "/api/ai/tools/posts";
export const AI_TOOLS_COMMENTS_PATH = "/api/ai/tools/comments";
export const AI_TOOLS_MEMORY_PATH = "/api/ai/tools/memory";
export const AI_TOOLS_URL_PATH = "/api/ai/tools/url";

export const AI_TOOLS_PATHS = [
    AI_TOOLS_EXPENSES_PATH,
    AI_TOOLS_POSTS_PATH,
    AI_TOOLS_COMMENTS_PATH,
    AI_TOOLS_MEMORY_PATH,
    AI_TOOLS_URL_PATH,
] as const;

export type { AiToolsCall, AiToolsResult } from "./types";
export { dayRangeUtc, filterLiteral, htmlToText } from "./shared";

export type AiToolsDeps = {
    /** PocketBase base URL (loopback in dev, mimi-pb in compose). */
    pbBaseUrl?: string;
    /** Shared client; created from `pbBaseUrl` when omitted (tests). */
    pb?: PbClient;
    /** Injectable for tests. */
    fetch?: typeof fetch;
    now?: () => number;
};

export type AiToolsService = (call: AiToolsCall) => Promise<AiToolsResult>;

const REGISTRY: Record<string, ToolHandler> = {
    [AI_TOOLS_EXPENSES_PATH]: expenses,
    [AI_TOOLS_POSTS_PATH]: posts,
    [AI_TOOLS_COMMENTS_PATH]: comments,
    [AI_TOOLS_MEMORY_PATH]: memory,
    [AI_TOOLS_URL_PATH]: readUrl,
};

export function createAiToolsService(deps: AiToolsDeps): AiToolsService {
    const now = deps.now ?? Date.now;
    const pb =
        deps.pb ??
        createPbClient({
            baseUrl: deps.pbBaseUrl ?? "",
            fetch: deps.fetch,
        });
    const log = logger.child("ai-tools");

    return async (call: AiToolsCall): Promise<AiToolsResult> => {
        const handler = REGISTRY[call.pathname];
        if (!handler) {
            return {
                status: 404,
                body: { error: { message: "not found" } },
            };
        }
        try {
            return await handler(call, {
                pb,
                now,
                ...(deps.fetch ? { fetch: deps.fetch } : {}),
            });
        } catch (error) {
            log.error("tool request failed", {
                path: call.pathname,
                error:
                    error instanceof Error
                        ? (error.stack ?? error.message)
                        : String(error),
            });
            return {
                status: 502,
                body: { error: { message: "数据工具暂时不可用，稍后再试" } },
            };
        }
    };
}
