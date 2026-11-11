/**
 * Public-URL fetcher shared by the chat's `read_url` tool and the code
 * sandbox.
 *
 * Both callers send model-controlled URLs, so the policy lives here once:
 * resolve the hostname and refuse private/reserved addresses, follow only
 * validated redirects, and cap the response size and time. The sandbox adds
 * its own byte caps on top (`sandbox.fetch` / `sandbox.download`).
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UrlPolicyError extends Error {}

export function isRedirect(status: number): boolean {
    return (
        status === 301 ||
        status === 302 ||
        status === 303 ||
        status === 307 ||
        status === 308
    );
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

export type PublicFetchText = {
    kind: "text";
    url: string;
    contentType: string;
    body: string;
    truncated: boolean;
};

export type PublicFetchBytes = {
    kind: "bytes";
    url: string;
    contentType: string;
    body: Uint8Array;
    truncated: boolean;
};

export type PublicFetchResult = PublicFetchText | PublicFetchBytes;

export type PublicFetchOptions = {
    /** Hard cap on the response body. */
    maxBytes: number;
    timeoutMs: number;
    headers?: Record<string, string>;
    /** Return raw bytes instead of decoded text (for image downloads). */
    binary?: boolean;
    maxRedirects?: number;
    /** Injectable for tests. */
    fetchImpl?: typeof fetch;
};

/**
 * Fetch a public http(s) URL with the SSRF policy above. Throws
 * `UrlPolicyError` for a disallowed target and `Error` for a failed request.
 */
export async function fetchPublic(
    rawUrl: string,
    options: PublicFetchOptions,
): Promise<PublicFetchResult> {
    let current: URL;
    try {
        current = new URL(rawUrl);
    } catch {
        throw new UrlPolicyError("网址格式不对");
    }
    if (current.protocol !== "http:" && current.protocol !== "https:") {
        throw new UrlPolicyError("只支持 http/https");
    }

    const fetchImpl = options.fetchImpl ?? fetch;
    let hops = options.maxRedirects ?? 3;
    for (;;) {
        await assertPublicHost(current.hostname);
        const res = await fetchImpl(current.toString(), {
            redirect: "manual",
            headers: {
                "User-Agent": "mimi-base-sandbox/1.0",
                Accept: "*/*",
                ...options.headers,
            },
            signal: AbortSignal.timeout(options.timeoutMs),
        });
        if (isRedirect(res.status)) {
            const location = res.headers.get("location");
            if (!location || hops <= 0) {
                throw new UrlPolicyError("重定向次数太多");
            }
            hops -= 1;
            let next: URL;
            try {
                next = new URL(location, current);
            } catch {
                throw new UrlPolicyError("重定向的地址不对");
            }
            if (next.protocol !== "http:" && next.protocol !== "https:") {
                throw new UrlPolicyError("重定向到了不支持的协议");
            }
            current = next;
            continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const { bytes, truncated } = await readBodyBytes(res, options.maxBytes);
        const contentType = res.headers.get("content-type") ?? "";
        if (options.binary) {
            return {
                kind: "bytes",
                url: current.toString(),
                contentType,
                body: bytes,
                truncated,
            };
        }
        return {
            kind: "text",
            url: current.toString(),
            contentType,
            body: new TextDecoder().decode(bytes),
            truncated,
        };
    }
}

async function readBodyBytes(
    res: Response,
    maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
    const reader = res.body?.getReader();
    if (!reader) return { bytes: new Uint8Array(), truncated: false };
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        const remaining = maxBytes - total;
        if (remaining <= 0) {
            truncated = true;
            void reader.cancel();
            break;
        }
        if (value.byteLength > remaining) {
            chunks.push(value.subarray(0, remaining));
            total += remaining;
            truncated = true;
            void reader.cancel();
            break;
        }
        chunks.push(value);
        total += value.byteLength;
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return { bytes, truncated };
}
