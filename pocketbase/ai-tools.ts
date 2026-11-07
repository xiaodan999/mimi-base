/**
 * Server-side data tools for the general chat.
 *
 * The browser executes tools client-side (app/chat/tools.ts) and forwards
 * these calls here, authenticated with the caller's PocketBase token. The
 * relay (ai-relay.ts) owns auth, rate limits and quotas; this module owns the
 * tool semantics.
 *
 * Security policy for every endpoint:
 * - Scope is enforced here with explicit PB filters, never assumed. The
 *   ledger (`ji_zhang_biao`) and feed (`posts`) are deliberately shared
 *   between the two accounts, matching the app's own screens; memories are
 *   strictly owner-scoped (PB rules are the backstop).
 * - `read_url` resolves DNS and refuses private/reserved addresses, follows
 *   only validated redirects, caps size and time, and strips HTML to text.
 * - Tool-level failures come back as `200 {ok:false}` so the model can react;
 *   only malformed requests or infrastructure failures get 4xx/5xx.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const AI_TOOLS_EXPENSES_PATH = "/ai/tools/expenses";
export const AI_TOOLS_POSTS_PATH = "/ai/tools/posts";
export const AI_TOOLS_MEMORY_PATH = "/ai/tools/memory";
export const AI_TOOLS_URL_PATH = "/ai/tools/url";

const MAX_EXPENSE_ROWS = 200;
const MAX_POST_ROWS = 30;
const MAX_MEMORIES = 100;
const MAX_MEMORY_CHARS = 500;
const MAX_POST_TEXT_CHARS = 300;
const MAX_ITEM_CHARS = 60;
const MAX_URL_BODY_BYTES = 300 * 1024;
const MAX_URL_TEXT_CHARS = 12_000;
const MAX_URL_REDIRECTS = 3;
const URL_TIMEOUT_MS = 10_000;
const URL_USER_AGENT = "mimi-base-chat/1.0 (tool)";

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

export type AiToolsDeps = {
    /** Loopback PocketBase base URL, e.g. http://127.0.0.1:8090 */
    pbBaseUrl: string;
    /** Injectable for tests. */
    fetch?: typeof fetch;
    now?: () => number;
};

export type AiToolsService = (call: AiToolsCall) => Promise<AiToolsResult>;

const toolOk = (body: unknown): AiToolsResult => ({ status: 200, body });
const toolFail = (error: string): AiToolsResult => ({
    status: 200,
    body: { ok: false, error },
});

/** Local (timezone-aware) day range to UTC ms. `tz` is the JS
 * `getTimezoneOffset()` value: minutes to add to local time for UTC. */
export function dayRangeUtc(
    from: string,
    to: string,
    tz: number,
): { startUtcMs: number; endUtcMs: number } {
    return {
        startUtcMs: Date.parse(`${from}T00:00:00Z`) + tz * 60_000,
        endUtcMs: Date.parse(`${to}T23:59:59.999Z`) + tz * 60_000,
    };
}

export function createAiToolsService(deps: AiToolsDeps): AiToolsService {
    const fetchImpl = deps.fetch ?? fetch;
    const now = deps.now ?? Date.now;

    async function pbRequest(
        path: string,
        options: {
            method: string;
            token: string;
            query?: Record<string, string>;
            body?: string;
        },
    ): Promise<Response> {
        const url = new URL(path, `${deps.pbBaseUrl}/`);
        if (options.query) {
            for (const [key, value] of Object.entries(options.query)) {
                url.searchParams.set(key, value);
            }
        }
        return fetchImpl(url.toString(), {
            method: options.method,
            headers: {
                Authorization: options.token,
                ...(options.body !== undefined
                    ? { "Content-Type": "application/json" }
                    : {}),
            },
            ...(options.body !== undefined ? { body: options.body } : {}),
            signal: AbortSignal.timeout(10_000),
        });
    }

    return async (call: AiToolsCall): Promise<AiToolsResult> => {
        try {
            switch (call.pathname) {
                case AI_TOOLS_EXPENSES_PATH:
                    return await expenses(call);
                case AI_TOOLS_POSTS_PATH:
                    return await posts(call);
                case AI_TOOLS_MEMORY_PATH:
                    return await memory(call);
                case AI_TOOLS_URL_PATH:
                    return await readUrl(call);
                default:
                    return {
                        status: 404,
                        body: { error: { message: "not found" } },
                    };
            }
        } catch (error) {
            console.error("[ai-tools] request failed", error);
            return {
                status: 502,
                body: { error: { message: "数据工具暂时不可用，稍后再试" } },
            };
        }
    };

    // ---------- /ai/tools/expenses ----------

    async function expenses(call: AiToolsCall): Promise<AiToolsResult> {
        const tz = parseTz(call.body.tz);
        const todayLocal = new Date(now() - tz * 60_000)
            .toISOString()
            .slice(0, 10);
        const from =
            parseDateField(call.body.from) ?? `${todayLocal.slice(0, 8)}01`;
        const to = parseDateField(call.body.to) ?? todayLocal;
        const { startUtcMs, endUtcMs } = dayRangeUtc(from, to, tz);
        if (endUtcMs < startUtcMs) return toolFail("日期范围不对");

        const filter = `(created >= "${pbDateTime(startUtcMs)}" && created <= "${pbDateTime(endUtcMs)}")`;
        const res = await pbRequest("/api/collections/ji_zhang_biao/records", {
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
        });
        if (!res.ok) return pbFail(res, "读不了账本");

        const json = (await res.json()) as {
            items?: Array<{
                id?: unknown;
                item_name?: unknown;
                price?: unknown;
                category?: unknown;
                created?: unknown;
                user_id?: unknown;
                expand?: { user_id?: { name?: unknown } };
            }>;
        };
        const rows = (json.items ?? []).map((row) => {
            const ownerId = typeof row.user_id === "string" ? row.user_id : "";
            const mine = ownerId === call.uid;
            const name =
                typeof row.expand?.user_id?.name === "string"
                    ? row.expand.user_id.name.trim()
                    : "";
            return {
                ownerId,
                entry: {
                    id: typeof row.id === "string" ? row.id : "",
                    item: text(row.item_name, MAX_ITEM_CHARS),
                    price: Math.round((Number(row.price) || 0) * 100) / 100,
                    category:
                        typeof row.category === "string" ? row.category : "",
                    created: typeof row.created === "string" ? row.created : "",
                    by: name !== "" ? name : mine ? "我" : "对方",
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
        // lookup instead of the model re-summing every row.
        const byPerson = new Map<
            string,
            { name: string; mine: boolean; total: number; count: number }
        >();
        for (const row of rows) {
            const entry = byPerson.get(row.ownerId) ?? {
                name: row.entry.by,
                mine: row.entry.mine,
                total: 0,
                count: 0,
            };
            entry.total =
                Math.round((entry.total + row.entry.price) * 100) / 100;
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

    // ---------- /ai/tools/posts ----------

    async function posts(call: AiToolsCall): Promise<AiToolsResult> {
        const query =
            typeof call.body.query === "string"
                ? call.body.query.trim().replace(/["\\]/g, "").slice(0, 80)
                : "";
        const rawLimit = Number(call.body.limit);
        const limit =
            Number.isFinite(rawLimit) && rawLimit >= 1
                ? Math.min(Math.floor(rawLimit), MAX_POST_ROWS)
                : 20;

        const res = await pbRequest("/api/collections/posts/records", {
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
        if (!res.ok) return pbFail(res, "读不了动态");

        const json = (await res.json()) as {
            items?: Array<{
                id?: unknown;
                text?: unknown;
                created?: unknown;
                images?: unknown;
                like_count?: unknown;
                author_id?: unknown;
                expand?: { author_id?: { name?: unknown } };
            }>;
        };
        const items = (json.items ?? []).map((row) => {
            const mine = row.author_id === call.uid;
            const name =
                typeof row.expand?.author_id?.name === "string"
                    ? row.expand.author_id.name.trim()
                    : "";
            return {
                id: typeof row.id === "string" ? row.id : "",
                text: text(row.text, MAX_POST_TEXT_CHARS),
                created: typeof row.created === "string" ? row.created : "",
                images: Array.isArray(row.images) ? row.images.length : 0,
                likes: Number(row.like_count) || 0,
                by: name !== "" ? name : mine ? "我" : "对方",
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

    // ---------- /ai/tools/memory ----------

    async function memory(call: AiToolsCall): Promise<AiToolsResult> {
        const ownerFilter = `(owner = "${call.uid}")`;

        if (call.body.action === "list") {
            const res = await pbRequest(
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
            if (!res.ok) return pbFail(res, "读不了记忆");
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
            const countRes = await pbRequest(
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
            const res = await pbRequest(
                "/api/collections/chat_memories/records",
                {
                    method: "POST",
                    token: call.token,
                    body: JSON.stringify({ owner: call.uid, content }),
                },
            );
            if (!res.ok) return pbFail(res, "记不住这条");
            const json = (await res.json()) as { id?: unknown };
            return toolOk({
                ok: true,
                saved: true,
                id: typeof json.id === "string" ? json.id : "",
                content,
            });
        }

        if (call.body.action === "delete") {
            const id =
                typeof call.body.id === "string" ? call.body.id.trim() : "";
            if (!/^[a-z0-9]+$/.test(id)) return toolFail("缺少要删除的记忆");
            const res = await pbRequest(
                `/api/collections/chat_memories/records/${encodeURIComponent(id)}`,
                { method: "DELETE", token: call.token },
            );
            if (res.status === 404) return toolFail("这条记忆不存在");
            if (!res.ok) return pbFail(res, "删不掉这条记忆");
            return toolOk({ ok: true, deleted: true, id });
        }

        return toolFail("未知的记忆操作");
    }

    // ---------- /ai/tools/url ----------

    async function readUrl(call: AiToolsCall): Promise<AiToolsResult> {
        const raw =
            typeof call.body.url === "string" ? call.body.url.trim() : "";
        if (raw === "") return toolFail("缺少网址");

        let current: URL;
        try {
            current = new URL(raw);
        } catch {
            return toolFail("网址格式不对");
        }
        if (current.protocol !== "http:" && current.protocol !== "https:") {
            return toolFail("只支持 http/https 链接");
        }

        try {
            let hops = MAX_URL_REDIRECTS;
            for (;;) {
                await assertPublicHost(current.hostname);
                const res = await fetchImpl(current.toString(), {
                    redirect: "manual",
                    headers: {
                        "User-Agent": URL_USER_AGENT,
                        Accept: "text/html, text/*;q=0.9, application/json;q=0.8, */*;q=0.5",
                    },
                    signal: AbortSignal.timeout(URL_TIMEOUT_MS),
                });
                if (isRedirect(res.status)) {
                    const location = res.headers.get("location");
                    if (!location || hops <= 0) {
                        return toolFail("网页重定向次数太多");
                    }
                    hops -= 1;
                    try {
                        current = new URL(location, current);
                    } catch {
                        return toolFail("网页重定向的地址不对");
                    }
                    if (
                        current.protocol !== "http:" &&
                        current.protocol !== "https:"
                    ) {
                        return toolFail("网页重定向到了不支持的协议");
                    }
                    continue;
                }
                if (!res.ok) {
                    return toolFail(`网页返回了 ${res.status}`);
                }

                const contentType = res.headers.get("content-type") ?? "";
                if (!isTextContentType(contentType)) {
                    return toolFail("这个链接不是文本内容，读不了");
                }
                const body = await readBodyCap(res, MAX_URL_BODY_BYTES);
                if (/html/i.test(contentType)) {
                    const { title, text: extracted } = htmlToText(body);
                    return toolOk({
                        ok: true,
                        url: current.toString(),
                        contentType,
                        ...(title ? { title } : {}),
                        text: extracted.slice(0, MAX_URL_TEXT_CHARS),
                        truncated: extracted.length > MAX_URL_TEXT_CHARS,
                    });
                }
                return toolOk({
                    ok: true,
                    url: current.toString(),
                    contentType,
                    text: body.slice(0, MAX_URL_TEXT_CHARS),
                    truncated: body.length > MAX_URL_TEXT_CHARS,
                });
            }
        } catch (error) {
            if (error instanceof Error && error.name === "TimeoutError") {
                return toolFail("网页加载超时了");
            }
            if (error instanceof UrlPolicyError) return toolFail(error.message);
            return toolFail("网页读不出来");
        }
    }
}

// ---------- shared helpers ----------

class UrlPolicyError extends Error {}

function isRedirect(status: number): boolean {
    return (
        status === 301 ||
        status === 302 ||
        status === 303 ||
        status === 307 ||
        status === 308
    );
}

function isTextContentType(contentType: string): boolean {
    const mime = contentType.split(";")[0]?.trim() ?? "";
    return /^(text\/|application\/(json|xml|javascript|xhtml))/i.test(mime);
}

/** Refuse hostnames that are (or resolve to) private/reserved addresses. */
export async function assertPublicHost(hostname: string): Promise<void> {
    if (isIP(hostname) !== 0) {
        if (isPrivateIp(hostname)) {
            throw new UrlPolicyError("不能访问内网地址");
        }
        return;
    }
    let addrs: Array<{ address: string }>;
    try {
        addrs = await lookup(hostname, { all: true, verbatim: true });
    } catch {
        throw new UrlPolicyError("解析不了这个域名");
    }
    if (addrs.length === 0) throw new UrlPolicyError("解析不了这个域名");
    for (const addr of addrs) {
        if (isPrivateIp(addr.address)) {
            throw new UrlPolicyError("不能访问内网地址");
        }
    }
}

/** True for IPv4/IPv6 loopback, private, link-local and reserved ranges. */
export function isPrivateIp(ip: string): boolean {
    if (isIP(ip) === 4) {
        const parts = ip.split(".").map(Number);
        if (
            parts.length !== 4 ||
            parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
        ) {
            return true; // malformed → treat as unsafe
        }
        const [a, b, c] = parts;
        return (
            a === 0 ||
            a === 10 ||
            a === 127 ||
            (a === 100 && b >= 64 && b <= 127) || // CGNAT
            (a === 169 && b === 254) || // link local
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 192 && b === 0 && c <= 2) || // 192.0.0.0/24 + TEST-NET-1
            (a === 198 && b === 51 && c === 100) || // TEST-NET-2
            (a === 198 && (b === 18 || b === 19)) || // benchmarking
            (a === 203 && b === 0 && c === 113) || // TEST-NET-3
            a >= 224 // multicast + reserved
        );
    }
    if (isIP(ip) === 6) {
        const lower = ip.toLowerCase();
        if (lower === "::" || lower === "::1") return true;
        if (lower.startsWith("::ffff:")) {
            const mapped = lower.slice(7);
            return mapped.includes(".") ? isPrivateIp(mapped) : true;
        }
        // fc00::/7 unique local, fe80::/10 link local, ff00::/8 multicast
        return (
            /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || /^ff/.test(lower)
        );
    }
    return true; // not an IP literal → unsafe default
}

export function htmlToText(html: string): { title: string; text: string } {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = decodeEntities(titleMatch?.[1] ?? "").trim();
    const withoutScripts = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ");
    const withBreaks = withoutScripts
        .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
        .replace(/<br[^>]*>/gi, "\n");
    const text = decodeEntities(withBreaks.replace(/<[^>]+>/g, " "))
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter((line) => line !== "")
        .join("\n");
    return { title, text };
}

export function decodeEntities(input: string): string {
    return input
        .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
            String.fromCodePoint(parseInt(hex, 16)),
        )
        .replace(/&#(\d+);/g, (_, dec: string) =>
            String.fromCodePoint(Number(dec)),
        )
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&apos;/gi, "'");
}

async function readBodyCap(res: Response, maxBytes: number): Promise<string> {
    const reader = res.body?.getReader();
    if (!reader) return "";
    const decoder = new TextDecoder();
    let bytes = 0;
    let out = "";
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        out += decoder.decode(value, { stream: true });
        if (bytes >= maxBytes) {
            void reader.cancel();
            break;
        }
    }
    return out;
}

function parseDateField(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
    if (Number.isNaN(Date.parse(`${trimmed}T00:00:00Z`))) return null;
    return trimmed;
}

function parseTz(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    return Math.max(-840, Math.min(840, Math.round(value)));
}

function pbDateTime(ms: number): string {
    return new Date(ms).toISOString().replace("T", " ");
}

function text(value: unknown, max: number): string {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** PB failures become tool-level `ok:false` results, not HTTP errors: the
 * model can tell the user something went wrong and try again. */
function pbFail(res: Response, fallback: string): AiToolsResult {
    console.error("[ai-tools] pb request failed", res.status);
    return toolFail(fallback);
}
