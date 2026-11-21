/**
 * Shared helpers for the server-side data tools.
 */

import type { AiToolsResult } from "./types";

/** Expanded `users` row. */
export type ExpandUser = {
    id?: unknown;
    user_name?: unknown;
    name?: unknown;
    tou_xiang?: unknown;
};

export function displayName(
    user: ExpandUser | undefined,
    mine: boolean,
): string {
    const name =
        typeof user?.user_name === "string"
            ? user.user_name.trim()
            : typeof user?.name === "string"
              ? user.name.trim()
              : "";
    return name !== "" ? name : mine ? "我" : "对方";
}

export function avatarFile(user: ExpandUser | undefined): string {
    return typeof user?.tou_xiang === "string" ? user.tou_xiang : "";
}

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

/** A double-quoted PocketBase filter literal. Values are escaped rather than
 * pasted raw into the filter expression. */
export function filterLiteral(value: string): string {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function isTextContentType(contentType: string): boolean {
    const mime = contentType.split(";")[0]?.trim() ?? "";
    return /^(text\/|application\/(json|xml|javascript|xhtml))/i.test(mime);
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

export function parseDateField(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
    if (Number.isNaN(Date.parse(`${trimmed}T00:00:00Z`))) return null;
    return trimmed;
}

export function parseTz(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    return Math.max(-840, Math.min(840, Math.round(value)));
}

export function pbDateTime(ms: number): string {
    return new Date(ms).toISOString().replace("T", " ");
}

export function text(value: unknown, max: number): string {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export const toolOk = (body: unknown): AiToolsResult => ({
    status: 200,
    body,
});
export const toolFail = (error: string): AiToolsResult => ({
    status: 200,
    body: { ok: false, error },
});
