import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";

import { createApp } from "./app";
import { getParsedBody } from "./http/body";
import { createLogger } from "./http/logger";
import {
    apiRequest,
    authHeader,
    json,
    type TempStaticDir,
    tempStaticDir,
} from "./test-helpers";

const PB_BASE = "http://127.0.0.1:8090";
const CHAT_PATH = "/api/ai/chat/completions";

/** Auth-refresh stub plus a JSON 200 for every other fetch. */
function pbFetch(): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/auth-refresh")) {
            return authHeader(init) === "pb-token"
                ? json({ record: { id: "user1234567890" } })
                : json({}, 401);
        }
        return json({});
    }) as typeof fetch;
}

function aiDeps() {
    return {
        pbBaseUrl: PB_BASE,
        apiKey: "server-key",
        model: "deepseek-v4.1-flash",
        dailyLimit: 0,
        fetch: pbFetch(),
    };
}

function chunkedBody(
    chunks: number,
    bytes: number,
): ReadableStream<Uint8Array> {
    let sent = 0;
    return new ReadableStream<Uint8Array>({
        pull(controller) {
            if (sent >= chunks) {
                controller.close();
                return;
            }
            sent += 1;
            controller.enqueue(new Uint8Array(bytes));
        },
    });
}

describe("app wiring", () => {
    test("health reports the PocketBase origin", async () => {
        const app = createApp({ pbBaseUrl: PB_BASE });
        const res = await app.handle(new Request("http://api.test/api/health"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, pb: PB_BASE });
    });

    test("unknown /api paths get the unified 404 envelope", async () => {
        const app = createApp({ pbBaseUrl: PB_BASE });
        const res = await app.handle(new Request("http://api.test/api/nope"));
        expect(res.status).toBe(404);
        expect(await res.json()).toMatchObject({
            error: { code: "not_found" },
        });
        expect(res.headers.get("x-request-id")).toBeTruthy();
    });

    test("a known path with the wrong method is 405", async () => {
        const app = createApp({ pbBaseUrl: PB_BASE });
        const res = await app.handle(
            new Request("http://api.test/api/health", { method: "POST" }),
        );
        expect(res.status).toBe(405);
        expect(res.headers.get("allow")).toContain("GET");
    });

    test("OPTIONS returns a CORS preflight", async () => {
        const app = createApp({ pbBaseUrl: PB_BASE });
        const res = await app.handle(
            new Request(`http://api.test${CHAT_PATH}`, {
                method: "OPTIONS",
            }),
        );
        expect(res.status).toBe(204);
        expect(res.headers.get("access-control-allow-origin")).toBe("*");
        expect(res.headers.get("access-control-allow-methods")).toContain(
            "POST",
        );
        expect(res.headers.get("x-request-id")).toBeTruthy();
    });

    test("errors carry CORS too", async () => {
        const app = createApp({ pbBaseUrl: PB_BASE, ai: aiDeps() });
        const res = await app.handle(
            new Request(`http://api.test${CHAT_PATH}`, { method: "POST" }),
        );
        expect(res.status).toBe(401);
        expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });

    test("401 happens before the body is parsed", async () => {
        const app = createApp({ pbBaseUrl: PB_BASE, ai: aiDeps() });
        // Invalid JSON over the cap: reaching the parser would answer 400 or
        // 413, so a 401 plus an unset parse slot proves the ordering.
        const request = new Request(`http://api.test${CHAT_PATH}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: `{${"x".repeat(16 * 1024 * 1024 + 1)}`,
        });
        const res = await app.handle(request);
        expect(res.status).toBe(401);
        expect(getParsedBody(request)).toBeUndefined();
    });

    test("a chunked over-cap body is 413", async () => {
        const app = createApp({
            pbBaseUrl: PB_BASE,
            ai: aiDeps(),
        });
        const res = await app.handle(
            new Request(`http://api.test${CHAT_PATH}`, {
                method: "POST",
                headers: {
                    Authorization: "pb-token",
                    "content-type": "application/json",
                },
                body: chunkedBody(2, 9 * 1024 * 1024),
            }),
        );
        expect(res.status).toBe(413);
        expect(await res.json()).toMatchObject({
            error: { code: "payload_too_large" },
        });
    });

    test("an unexpected throw is a 500 with the request id, no stack", async () => {
        const app = createApp({
            pbBaseUrl: PB_BASE,
            ai: aiDeps(),
            // Authenticator reads the clock after the successful refresh.
            now: () => {
                throw new Error("clock exploded");
            },
            logger: createLogger({ level: "error", sink: () => {} }),
        });
        const res = await app.handle(
            new Request(`http://api.test${CHAT_PATH}`, {
                method: "POST",
                headers: {
                    Authorization: "pb-token",
                    "content-type": "application/json",
                    "x-request-id": "req-500",
                },
                body: JSON.stringify({ messages: [] }),
            }),
        );
        expect(res.status).toBe(500);
        expect(res.headers.get("x-request-id")).toBe("req-500");
        const text = await res.text();
        expect(text).not.toContain("clock exploded");
        expect(JSON.parse(text)).toMatchObject({
            error: {
                code: "internal_error",
                requestId: "req-500",
            },
        });
    });

    test("POST /share redirects stale share targets", async () => {
        const stats = tempStaticDir();
        try {
            const app = createApp({
                pbBaseUrl: PB_BASE,
                staticDir: stats.dir,
            });
            const res = await app.handle(
                new Request("http://api.test/share", { method: "POST" }),
            );
            expect(res.status).toBe(303);
            expect(res.headers.get("location")).toBe("/share?stale=1");
        } finally {
            stats.cleanup();
        }
    });

    test("static fallback serves assets and the SPA shell", async () => {
        const stats: TempStaticDir = tempStaticDir();
        try {
            const app = createApp({
                pbBaseUrl: PB_BASE,
                staticDir: stats.dir,
            });
            const asset = await app.handle(
                new Request("http://api.test/assets/app.js"),
            );
            expect(asset.status).toBe(200);
            expect(await asset.text()).toContain("console.log");

            const deep = await app.handle(
                new Request("http://api.test/_protected/_main/home"),
            );
            expect(deep.status).toBe(200);
            expect(await deep.text()).toContain("mimi");

            const missing = await app.handle(
                new Request("http://api.test/assets/missing.js"),
            );
            expect(missing.status).toBe(404);
        } finally {
            stats.cleanup();
        }
    });

    test("static fallback rejects traversal and dotfiles", async () => {
        const stats = tempStaticDir();
        try {
            const app = createApp({
                pbBaseUrl: PB_BASE,
                staticDir: stats.dir,
            });
            for (const pathname of ["/%2e%2e/%2e%2e/secret.txt", "/.env"]) {
                const res = await app.handle(
                    new Request(`http://api.test${pathname}`),
                );
                expect(res.status).toBe(404);
            }
            const nul = await app.handle(
                new Request("http://api.test/assets/%00.js"),
            );
            expect(nul.status).toBe(400);
        } finally {
            stats.cleanup();
        }
    });

    test("passes SSE bytes through the app", async () => {
        const encoder = new TextEncoder();
        const fetchImpl = (async (
            input: RequestInfo | URL,
            init?: RequestInit,
        ) => {
            if (String(input).endsWith("/auth-refresh")) {
                return authHeader(init) === "pb-token"
                    ? json({ record: { id: "user1234567890" } })
                    : json({}, 401);
            }
            return new Response(
                new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(encoder.encode("data: one\n\n"));
                        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                        controller.close();
                    },
                }),
                { headers: { "content-type": "text/event-stream" } },
            );
        }) as typeof fetch;
        const app = createApp({
            pbBaseUrl: PB_BASE,
            fetch: fetchImpl,
            ai: {
                pbBaseUrl: PB_BASE,
                apiKey: "server-key",
                model: "deepseek-v4.1-flash",
                dailyLimit: 0,
                fetch: fetchImpl,
            },
        });
        const res = await app.handle(
            apiRequest(CHAT_PATH, {
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    messages: [{ role: "user", content: "hi" }],
                    stream: true,
                }),
            }),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("text/event-stream");
        expect(await res.text()).toContain("data: one");
    });

    test("multipart FormData reaches the video compressor", async () => {
        const app = createApp({
            pbBaseUrl: PB_BASE,
            fetch: pbFetch(),
            video: {
                tmpDir: tmpdir(),
                compress: async (_input, output) => {
                    await Bun.write(output, new Uint8Array([1, 2, 3]));
                    return { ok: true };
                },
            },
        });
        const form = new FormData();
        form.append(
            "file",
            new File(["original"], "clip.mp4", { type: "video/mp4" }),
        );
        const res = await app.handle(
            apiRequest("/api/video/compress", {
                token: "pb-token",
                body: form,
            }),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("x-video-compressed")).toBe("1");
        expect(new Uint8Array(await res.arrayBuffer())).toEqual(
            new Uint8Array([1, 2, 3]),
        );
    });
});
