/**
 * AI 生成内容的本地缓存。
 * 只写 localStorage，不同步到云端；换设备会重新生成。
 *
 * 每条缓存是一个带版本 / 模型 / 提示词版本 / 过期时间的信封，读的时候用
 * zod 校验；换模型或改提示词都会让它失效。key 用 SHA-256 生成，
 * 不再用那个容易碰撞的 32 位 hash*31。
 */

import { z } from "zod";

import { AI_MODEL } from "./constants";
import { PROMPT_VERSION } from "./prompt-base";

const PREFIX = "mimi:ai-cache:v1:";
const LEGACY_PREFIX = "mimi-study:ai-cache:v1:";
const CACHE_VERSION = 1;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

const envelopeSchema = z.object({
    v: z.literal(CACHE_VERSION),
    model: z.string(),
    promptVersion: z.string(),
    createdAt: z.number(),
    ttl: z.number(),
    data: z.unknown(),
});

type CacheEnvelope = z.infer<typeof envelopeSchema>;

export function readAiCache<T>(key: string): T | null {
    if (typeof window === "undefined") return null;
    try {
        const raw =
            localStorage.getItem(PREFIX + key) ??
            localStorage.getItem(LEGACY_PREFIX + key);
        if (!raw) return null;
        const parsed = envelopeSchema.safeParse(JSON.parse(raw));
        // 旧格式 / 损坏 / 手改过的数据一律作废，重新生成。
        if (!parsed.success) return null;
        const env = parsed.data;
        // 换模型、改提示词都让旧结果失效。
        if (env.model !== AI_MODEL) return null;
        if (env.promptVersion !== PROMPT_VERSION) return null;
        if (Date.now() - env.createdAt > env.ttl) {
            removeAiCache(key);
            return null;
        }
        return env.data as T;
    } catch {
        return null;
    }
}

export type WriteCacheOptions = { ttlMs?: number };

export function writeAiCache<T>(
    key: string,
    value: T,
    options?: WriteCacheOptions,
) {
    if (typeof window === "undefined") return;
    try {
        const env: CacheEnvelope = {
            v: CACHE_VERSION,
            model: AI_MODEL,
            promptVersion: PROMPT_VERSION,
            createdAt: Date.now(),
            ttl: options?.ttlMs ?? DEFAULT_TTL_MS,
            data: value,
        };
        localStorage.setItem(PREFIX + key, JSON.stringify(env));
    } catch {
        // 空间满了或被禁用时静默失败，不影响当前会话
    }
}

/** 生成结果不满意时，丢掉这一条再重算。 */
export function removeAiCache(key: string) {
    if (typeof window === "undefined") return;
    try {
        localStorage.removeItem(PREFIX + key);
        localStorage.removeItem(LEGACY_PREFIX + key);
    } catch {
        // ignore
    }
}

export function clearAiCache() {
    if (typeof window === "undefined") return;
    try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(PREFIX) || key?.startsWith(LEGACY_PREFIX)) {
                keys.push(key);
            }
        }
        keys.forEach((key) => localStorage.removeItem(key));
    } catch {
        // ignore
    }
}

/* ------------------------------------------------------------------ */
/* SHA-256：同步版给 cache key，异步版走 crypto.subtle.digest          */
/* ------------------------------------------------------------------ */

const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INITIAL_H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
]);

function rotr(x: number, n: number): number {
    return (x >>> n) | (x << (32 - n));
}

/** 纯 JS 同步 SHA-256，返回 64 位小写 hex。cache key 必须在 render 期同步算出来。 */
export function sha256Sync(message: string): string {
    const bytes = new TextEncoder().encode(message);
    const bitLen = bytes.length * 8;
    const total = Math.ceil((bytes.length + 9) / 64) * 64;
    const data = new Uint8Array(total);
    data.set(bytes);
    data[bytes.length] = 0x80;
    const view = new DataView(data.buffer);
    view.setUint32(total - 8, Math.floor(bitLen / 0x100000000));
    view.setUint32(total - 4, bitLen >>> 0);

    const H = Uint32Array.from(INITIAL_H);
    const w = new Uint32Array(64);
    for (let off = 0; off < total; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
        for (let i = 16; i < 64; i++) {
            const s0 =
                rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 =
                rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        let a = H[0],
            b = H[1],
            c = H[2],
            d = H[3],
            e = H[4],
            f = H[5],
            g = H[6],
            h = H[7];
        for (let i = 0; i < 64; i++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) | 0;
            h = g;
            g = f;
            f = e;
            e = (d + t1) | 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) | 0;
        }
        H[0] = (H[0] + a) | 0;
        H[1] = (H[1] + b) | 0;
        H[2] = (H[2] + c) | 0;
        H[3] = (H[3] + d) | 0;
        H[4] = (H[4] + e) | 0;
        H[5] = (H[5] + f) | 0;
        H[6] = (H[6] + g) | 0;
        H[7] = (H[7] + h) | 0;
    }
    return Array.from(H, (x) => x.toString(16).padStart(8, "0")).join("");
}

/**
 * 异步 SHA-256，走浏览器原生 crypto.subtle.digest（与 sha256Sync 结果一致）。
 * 有异步边界的场景优先用它；render 期算 key 只能用同步版。
 */
export async function sha256(text: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text),
    );
    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
    ).join("");
}

/** 把一段文本压成短 key，用于「同一道题 + 同一个答案」的批改缓存。 */
export function hashText(text: string): string {
    // 取完整 64 位 hex 的前 32 位（128 bit），足够抗碰撞又不会把 key 撑太长。
    return sha256Sync(text).slice(0, 32);
}
