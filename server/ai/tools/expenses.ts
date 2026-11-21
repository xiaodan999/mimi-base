/**
 * `/api/ai/tools/expenses` — the shared ledger.
 */

import { logger } from "../../http/logger";
import {
    avatarFile,
    dayRangeUtc,
    displayName,
    type ExpandUser,
    parseDateField,
    parseTz,
    pbDateTime,
    text,
    toolFail,
    toolOk,
} from "./shared";
import type { AiToolsCall, AiToolsResult, ToolContext } from "./types";

const MAX_EXPENSE_ROWS = 200;
const MAX_ITEM_CHARS = 60;

function pbFail(status: number, fallback: string): AiToolsResult {
    logger.child("ai-tools").error("pb request failed", { status });
    return toolFail(fallback);
}

export async function expenses(
    call: AiToolsCall,
    context: ToolContext,
): Promise<AiToolsResult> {
    const tz = parseTz(call.body.tz);
    const todayLocal = new Date(context.now() - tz * 60_000)
        .toISOString()
        .slice(0, 10);
    const from =
        parseDateField(call.body.from) ?? `${todayLocal.slice(0, 8)}01`;
    const to = parseDateField(call.body.to) ?? todayLocal;
    const { startUtcMs, endUtcMs } = dayRangeUtc(from, to, tz);
    if (endUtcMs < startUtcMs) return toolFail("日期范围不对");

    const filter = `(created >= "${pbDateTime(startUtcMs)}" && created <= "${pbDateTime(endUtcMs)}")`;
    const res = await context.pb.request(
        "/api/collections/ji_zhang_biao/records",
        {
            method: "GET",
            token: call.token,
            query: {
                filter,
                sort: "created",
                perPage: String(MAX_EXPENSE_ROWS),
                // Who spent what: the users viewRule lets any signed-in user
                // read both profiles, so the expand resolves for both sides.
                expand: "user_id",
            },
        },
    );
    if (!res.ok) return pbFail(res.status, "读不了账本");

    const json = (await res.json()) as {
        items?: Array<{
            id?: unknown;
            item_name?: unknown;
            price?: unknown;
            category?: unknown;
            created?: unknown;
            user_id?: unknown;
            expand?: { user_id?: ExpandUser };
        }>;
    };
    const rows = (json.items ?? []).map((row) => {
        const ownerId = typeof row.user_id === "string" ? row.user_id : "";
        const mine = ownerId === call.uid;
        return {
            ownerId,
            avatar: avatarFile(row.expand?.user_id),
            entry: {
                id: typeof row.id === "string" ? row.id : "",
                item: text(row.item_name, MAX_ITEM_CHARS),
                price: Math.round((Number(row.price) || 0) * 100) / 100,
                category: typeof row.category === "string" ? row.category : "",
                created: typeof row.created === "string" ? row.created : "",
                by: displayName(row.expand?.user_id, mine),
                mine,
            },
        };
    });
    const items = rows.map((row) => row.entry);
    const total = items.reduce((sum, item) => sum + item.price, 0);
    const byCategory: Record<string, number> = {};
    for (const item of items) {
        const key = item.category || "other";
        byCategory[key] =
            Math.round(((byCategory[key] ?? 0) + item.price) * 100) / 100;
    }
    // Per-person totals, biggest spender first, so 「谁花得最多」 is a
    // lookup instead of the model re-summing every row. id + avatar let
    // the client render real profile chips without another request.
    const byPerson = new Map<
        string,
        {
            id: string;
            name: string;
            avatar: string;
            mine: boolean;
            total: number;
            count: number;
        }
    >();
    for (const row of rows) {
        const entry = byPerson.get(row.ownerId) ?? {
            id: row.ownerId,
            name: row.entry.by,
            avatar: row.avatar,
            mine: row.entry.mine,
            total: 0,
            count: 0,
        };
        entry.total = Math.round((entry.total + row.entry.price) * 100) / 100;
        entry.count += 1;
        byPerson.set(row.ownerId, entry);
    }
    return toolOk({
        ok: true,
        range: { from, to },
        count: items.length,
        truncated: items.length >= MAX_EXPENSE_ROWS,
        total: Math.round(total * 100) / 100,
        byCategory,
        people: [...byPerson.values()].sort((a, b) => b.total - a.total),
        items,
    });
}
