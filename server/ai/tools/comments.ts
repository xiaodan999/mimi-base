/**
 * `/api/ai/tools/comments` — comments on the shared feed.
 */

import { isRecordId } from "../../../lib/chat-files";
import { logger } from "../../http/logger";
import {
    avatarFile,
    displayName,
    type ExpandUser,
    filterLiteral,
    text,
    toolFail,
    toolOk,
} from "./shared";
import type { AiToolsCall, AiToolsResult, ToolContext } from "./types";

const MAX_COMMENT_ROWS = 60;
const MAX_COMMENT_TEXT_CHARS = 600;
const MAX_COMMENT_POST_TEXT_CHARS = 160;
const MAX_COMMENT_QUERY_CHARS = 60;
const MAX_COMMENT_AUTHOR_CHARS = 40;

export async function comments(
    call: AiToolsCall,
    context: ToolContext,
): Promise<AiToolsResult> {
    if (
        call.body.post_id !== undefined &&
        typeof call.body.post_id !== "string"
    ) {
        return toolFail("post_id 应该是动态记录 id");
    }
    const postId =
        typeof call.body.post_id === "string" ? call.body.post_id.trim() : "";
    if (postId !== "" && !isRecordId(postId)) {
        return toolFail("post_id 不是有效的动态记录 id");
    }
    const query =
        typeof call.body.query === "string"
            ? call.body.query
                  .trim()
                  .replace(/["\\]/g, "")
                  .slice(0, MAX_COMMENT_QUERY_CHARS)
            : "";
    const author =
        typeof call.body.author === "string"
            ? call.body.author
                  .trim()
                  .replace(/["\\]/g, "")
                  .slice(0, MAX_COMMENT_AUTHOR_CHARS)
            : "";
    const rawLimit = Number(call.body.limit);
    const limit =
        Number.isFinite(rawLimit) && rawLimit >= 1
            ? Math.min(Math.floor(rawLimit), MAX_COMMENT_ROWS)
            : 20;

    // Comments are shared-scope like the feed itself (both accounts see
    // every post); each filter value is quoted as a literal, never
    // interpolated raw. `author` accepts a record id or a display name.
    const conditions: string[] = [];
    if (postId !== "") {
        conditions.push(`post_id = ${filterLiteral(postId)}`);
    }
    if (query !== "") {
        conditions.push(`text ~ ${filterLiteral(query)}`);
    }
    if (author !== "") {
        conditions.push(
            isRecordId(author)
                ? `author_id = ${filterLiteral(author)}`
                : `author_id.user_name ~ ${filterLiteral(author)}`,
        );
    }
    const filter = conditions.length > 0 ? `(${conditions.join(" && ")})` : "";

    const res = await context.pb.request("/api/collections/comments/records", {
        method: "GET",
        token: call.token,
        query: {
            ...(filter ? { filter } : {}),
            sort: "-created",
            perPage: String(limit),
            // Author name/avatar, the post the comment belongs to, and
            // the parent comment's author (the app renders replies as
            // 回复 @name). The users viewRule lets both accounts read
            // each other's profile.
            expand: "author_id,post_id,parent_id.author_id",
        },
    });
    if (!res.ok) {
        logger.child("ai-tools").error("pb request failed", {
            status: res.status,
        });
        return toolFail("读不了评论");
    }

    const json = (await res.json()) as {
        items?: Array<{
            id?: unknown;
            text?: unknown;
            created?: unknown;
            images?: unknown;
            parent_id?: unknown;
            post_id?: unknown;
            author_id?: unknown;
            expand?: {
                author_id?: ExpandUser;
                post_id?: { id?: unknown; text?: unknown };
                parent_id?: {
                    author_id?: unknown;
                    expand?: { author_id?: ExpandUser };
                };
            };
        }>;
    };
    const items = (json.items ?? []).map((row) => {
        const mine = row.author_id === call.uid;
        const parent = row.expand?.parent_id;
        const parentAuthorId =
            typeof parent?.author_id === "string" ? parent.author_id : "";
        return {
            id: typeof row.id === "string" ? row.id : "",
            text: text(row.text, MAX_COMMENT_TEXT_CHARS),
            created: typeof row.created === "string" ? row.created : "",
            images: Array.isArray(row.images) ? row.images.length : 0,
            // parentId lets the model see who replied to whom; replyTo
            // names the parent comment's author for 「回复 @谁」 answers.
            parentId: typeof row.parent_id === "string" ? row.parent_id : "",
            replyTo: parent
                ? displayName(
                      parent.expand?.author_id,
                      parentAuthorId === call.uid,
                  )
                : "",
            postId: typeof row.post_id === "string" ? row.post_id : "",
            postText: text(
                row.expand?.post_id?.text,
                MAX_COMMENT_POST_TEXT_CHARS,
            ),
            // id + avatar filename let the client render the commenter's
            // real profile chip (tokened URL built at render time).
            authorId: typeof row.author_id === "string" ? row.author_id : "",
            avatar: avatarFile(row.expand?.author_id),
            by: displayName(row.expand?.author_id, mine),
            mine,
        };
    });
    return toolOk({
        ok: true,
        ...(postId ? { postId } : {}),
        ...(query ? { query } : {}),
        ...(author ? { author } : {}),
        limit,
        count: items.length,
        truncated: items.length >= limit,
        items,
    });
}
