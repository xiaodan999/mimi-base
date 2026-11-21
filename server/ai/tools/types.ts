/**
 * Shared types for the server-side data tools.
 */

import type { PbClient } from "../../http/pb";

export type AiToolsCall = {
    pathname: string;
    /** Parsed JSON body (object, pre-validated by the relay). */
    body: Record<string, unknown>;
    /** Authenticated PocketBase user id. */
    uid: string;
    /** The caller's PocketBase token, used for PB REST calls. */
    token: string;
};

export type AiToolsResult = { status: number; body: unknown };

export type ToolContext = {
    pb: PbClient;
    now: () => number;
    /** Injected only in tests so read_url can exercise the policy offline. */
    fetch?: typeof fetch;
};

export type ToolHandler = (
    call: AiToolsCall,
    context: ToolContext,
) => Promise<AiToolsResult>;
