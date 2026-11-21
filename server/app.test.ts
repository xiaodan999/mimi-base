import { describe, expect, test } from "bun:test";

import { createApp, type SpikeCounters } from "./app";

function counters(): SpikeCounters {
    return { parseCalls: 0 };
}

function post(
    path: string,
    body: BodyInit,
    headers: Record<string, string> = {},
    token: string | null = "good-token",
) {
    return new Request(`http://app.test${path}`, {
        method: "POST",
        headers: {
            ...(token ? { Authorization: token } : {}),
            ...headers,
        },
        body,
    });
}

describe("elysia spike", () => {
    test("(a) unauthenticated POST returns 401 before the body parser runs", async () => {
        const stats = counters();
        const app = createApp(stats);
        // 1 MiB is well over the 64 KiB cap; the guard must answer first.
        const res = await app.handle(
            post("/api/echo", "x".repeat(1024 * 1024), {}, null),
        );
        expect(res.status).toBe(401);
        expect(stats.parseCalls).toBe(0);
    });

    test("(b) chunked over-cap input returns 413", async () => {
        const stats = counters();
        const app = createApp(stats);
        let sent = 0;
        const stream = new ReadableStream<Uint8Array>({
            pull(controller) {
                if (sent >= 2) {
                    controller.close();
                    return;
                }
                sent += 1;
                controller.enqueue(new Uint8Array(40 * 1024));
            },
        });
        const res = await app.handle(
            new Request("http://app.test/api/echo", {
                method: "POST",
                headers: { Authorization: "good-token" },
                body: stream,
            }),
        );
        expect(res.status).toBe(413);
        expect(stats.parseCalls).toBe(1);
    });

    test("(c) SSE bytes arrive incrementally from the returned Response", async () => {
        const app = createApp(counters());
        const res = await app.handle(
            new Request("http://app.test/api/sse", {
                headers: { Authorization: "good-token" },
            }),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/event-stream");
        const reader = res.body?.getReader();
        if (!reader) throw new Error("no body");
        const decoder = new TextDecoder();
        const first = await reader.read();
        expect(decoder.decode(first.value)).toBe("a");
        const second = await reader.read();
        expect(decoder.decode(second.value)).toBe("b");
        expect((await reader.read()).done).toBe(true);
    });

    test("(d) /* matches / and deep paths", async () => {
        const app = createApp(counters());
        const root = await app.handle(
            new Request("http://app.test/", {
                headers: { Authorization: "good-token" },
            }),
        );
        expect(await root.text()).toBe("static:GET:/");
        const deep = await app.handle(
            new Request("http://app.test/_protected/_main/home", {
                headers: { Authorization: "good-token" },
            }),
        );
        expect(await deep.text()).toBe("static:GET:/_protected/_main/home");
    });

    test("(e) multipart FormData round-trips", async () => {
        const app = createApp(counters());
        const form = new FormData();
        form.append(
            "file",
            new File(["hello"], "note.txt", { type: "text/plain" }),
        );
        const res = await app.handle(post("/api/echo", form));
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({
            kind: "form",
            name: "note.txt",
            size: 5,
        });
    });

    test("JSON bodies round-trip and bad JSON is 400", async () => {
        const app = createApp(counters());
        const ok = await app.handle(
            post("/api/echo", JSON.stringify({ a: 1 }), {
                "content-type": "application/json",
            }),
        );
        expect(await ok.json()).toEqual({ kind: "json", body: { a: 1 } });

        const bad = await app.handle(
            post("/api/echo", "{nope", { "content-type": "application/json" }),
        );
        expect(bad.status).toBe(400);
    });
});
