/**
 * `/api/ai/tools/url` — guarded public-page reader.
 */

import { fetchPublic, UrlPolicyError } from "../../safe-fetch";
import { htmlToText, isTextContentType, toolFail, toolOk } from "./shared";
import type { AiToolsCall, AiToolsResult, ToolContext } from "./types";

const MAX_URL_BODY_BYTES = 300 * 1024;
const MAX_URL_TEXT_CHARS = 12_000;
const MAX_URL_REDIRECTS = 3;
const URL_TIMEOUT_MS = 10_000;
const URL_USER_AGENT = "mimi-base-chat/1.0 (tool)";

export async function readUrl(
    call: AiToolsCall,
    context: ToolContext,
): Promise<AiToolsResult> {
    const raw = typeof call.body.url === "string" ? call.body.url.trim() : "";
    if (raw === "") return toolFail("缺少网址");

    try {
        // `fetchPublic` resolves once, validates every address, pins the
        // connection to the validated IP and re-checks each redirect.
        const result = await fetchPublic(raw, {
            maxBytes: MAX_URL_BODY_BYTES,
            timeoutMs: URL_TIMEOUT_MS,
            maxRedirects: MAX_URL_REDIRECTS,
            headers: {
                "User-Agent": URL_USER_AGENT,
                Accept: "text/html, text/*;q=0.9, application/json;q=0.8, */*;q=0.5",
            },
            // Production must use the pinned transport; tests inject a
            // fake fetch to exercise the policy without the network.
            ...(context.fetch ? { fetchImpl: context.fetch } : {}),
        });
        if (result.kind !== "text" || !isTextContentType(result.contentType)) {
            return toolFail("这个链接不是文本内容，读不了");
        }
        if (/html/i.test(result.contentType)) {
            const { title, text: extracted } = htmlToText(result.body);
            return toolOk({
                ok: true,
                url: result.url,
                contentType: result.contentType,
                ...(title ? { title } : {}),
                text: extracted.slice(0, MAX_URL_TEXT_CHARS),
                truncated:
                    result.truncated || extracted.length > MAX_URL_TEXT_CHARS,
            });
        }
        return toolOk({
            ok: true,
            url: result.url,
            contentType: result.contentType,
            text: result.body.slice(0, MAX_URL_TEXT_CHARS),
            truncated:
                result.truncated || result.body.length > MAX_URL_TEXT_CHARS,
        });
    } catch (error) {
        if (
            error instanceof Error &&
            (error.name === "TimeoutError" || error.name === "AbortError")
        ) {
            return toolFail("网页加载超时了");
        }
        if (error instanceof UrlPolicyError) return toolFail(error.message);
        return toolFail("网页读不出来");
    }
}
