/**
 * `/api/ai/tools/posts` — the shared feed.
 */

import { logger } from "../../http/logger";
import {
    avatarFile,
    displayName,
    type ExpandUser,
    text,
    toolFail,
    toolOk,
} from "./shared";
import type { AiToolsCall, AiToolsResult, ToolContext } from "./types";

const MAX_POST_ROWS = 30;
const MAX_POST_TEXT_CHARS = 300;

export async function posts(
    call: AiToolsCall,
    context: ToolContext,
): Promise<AiToolsResult> {
    const query =
        typeof call.body.query === "string"
            ? call.body.query.trim().replace(/["\\]/g, "").slice(0, 80)
            : "";
    const rawLimit = Number(call.body.limit);
    const limit =
        Number.isFinite(rawLimit) && rawLimit >= 1
            ? Math.min(Math.floor(rawLimit), MAX_POST_ROWS)
            : 20;

    const res = await context.pb.request("/api/collections/posts/records", {
        method: "GET",
        token: call.token,
        query: {
            ...(query ? { filter: `(text ~ "${query}")` } : {}),
            sort: "-created",
            perPage: String(limit),
            // Author name for 「谁发的」questions; the users viewRule lets
            // any signed-in user read both profiles.
            expand: "author_id",
        },
    });
    if (!res.ok) {
        logger.child("ai-tools").error("pb request failed", {
            status: res.status,
        });
        return toolFail("读不了动态");
    }

    const json = (await res.json()) as {
        items?: Array<{
            id?: unknown;
            text?: unknown;
            created?: unknown;
            images?: unknown;
            like_count?: unknown;
            comment_count?: unknown;
            author_id?: unknown;
            expand?: { author_id?: ExpandUser };
        }>;
    };
    const items = (json.items ?? []).map((row) => {
        const mine = row.author_id === call.uid;
        return {
            id: typeof row.id === "string" ? row.id : "",
            text: text(row.text, MAX_POST_TEXT_CHARS),
            created: typeof row.created === "string" ? row.created : "",
            images: Array.isArray(row.images) ? row.images.length : 0,
            likes: Number(row.like_count) || 0,
            comments: Number(row.comment_count) || 0,
            // id + avatar filename let the client render the author's
            // real profile chip (tokened URL built at render time).
            authorId: typeof row.author_id === "string" ? row.author_id : "",
            avatar: avatarFile(row.expand?.author_id),
            by: displayName(row.expand?.author_id, mine),
            mine,
        };
    });
    return toolOk({
        ok: true,
        ...(query ? { query } : {}),
        count: items.length,
        items,
    });
}
