/**
 * `/api/ai/tools/memory` — owner-scoped chat memories.
 */

import { logger } from "../../http/logger";
import { text, toolFail, toolOk } from "./shared";
import type { AiToolsCall, AiToolsResult, ToolContext } from "./types";

const MAX_MEMORIES = 100;
const MAX_MEMORY_CHARS = 500;

export async function memory(
    call: AiToolsCall,
    context: ToolContext,
): Promise<AiToolsResult> {
    const ownerFilter = `(owner = "${call.uid}")`;

    if (call.body.action === "list") {
        const res = await context.pb.request(
            "/api/collections/chat_memories/records",
            {
                method: "GET",
                token: call.token,
                query: {
                    filter: ownerFilter,
                    sort: "-updated",
                    perPage: String(MAX_MEMORIES),
                },
            },
        );
        if (!res.ok) {
            logger.child("ai-tools").error("pb request failed", {
                status: res.status,
            });
            return toolFail("读不了记忆");
        }
        const json = (await res.json()) as {
            items?: Array<Record<string, unknown>>;
        };
        return toolOk({
            ok: true,
            items: (json.items ?? []).map((row) => ({
                id: typeof row.id === "string" ? row.id : "",
                content: text(row.content, MAX_MEMORY_CHARS),
                created: typeof row.created === "string" ? row.created : "",
            })),
        });
    }

    if (call.body.action === "save") {
        const content = text(call.body.content, MAX_MEMORY_CHARS);
        if (content === "") return toolFail("要记的内容是空的");
        const countRes = await context.pb.request(
            "/api/collections/chat_memories/records",
            {
                method: "GET",
                token: call.token,
                query: { filter: ownerFilter, perPage: "1" },
            },
        );
        if (countRes.ok) {
            const json = (await countRes.json()) as {
                totalItems?: unknown;
            };
            if (Number(json.totalItems) >= MAX_MEMORIES) {
                return toolFail("记忆已经够多了，先删掉一些再记");
            }
        }
        const res = await context.pb.request(
            "/api/collections/chat_memories/records",
            {
                method: "POST",
                token: call.token,
                body: JSON.stringify({ owner: call.uid, content }),
            },
        );
        if (!res.ok) {
            logger.child("ai-tools").error("pb request failed", {
                status: res.status,
            });
            return toolFail("记不住这条");
        }
        const json = (await res.json()) as { id?: unknown };
        return toolOk({
            ok: true,
            saved: true,
            id: typeof json.id === "string" ? json.id : "",
            content,
        });
    }

    if (call.body.action === "delete") {
        const id = typeof call.body.id === "string" ? call.body.id.trim() : "";
        if (!/^[a-z0-9]+$/.test(id)) return toolFail("缺少要删除的记忆");
        const res = await context.pb.request(
            `/api/collections/chat_memories/records/${encodeURIComponent(id)}`,
            { method: "DELETE", token: call.token },
        );
        if (res.status === 404) return toolFail("这条记忆不存在");
        if (!res.ok) {
            logger.child("ai-tools").error("pb request failed", {
                status: res.status,
            });
            return toolFail("删不掉这条记忆");
        }
        return toolOk({ ok: true, deleted: true, id });
    }

    return toolFail("未知的记忆操作");
}
