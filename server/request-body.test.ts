import { describe, expect, test } from "bun:test";

import {
    BodyTooLargeError,
    readFormDataBody,
    readJsonBody,
    readRequestBody,
} from "./request-body";

function streamRequest(chunks: string[], headers: Record<string, string> = {}) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks)
                controller.enqueue(encoder.encode(chunk));
            controller.close();
        },
    });
    return new Request("http://api/test", {
        method: "POST",
        headers,
        body: stream,
        // Bun/undici need this for a streaming request body.
        duplex: "half",
    } as RequestInit & { duplex: "half" });
}

describe("readRequestBody", () => {
    test("buffers a chunked body and returns its bytes", async () => {
        const bytes = await readRequestBody(
            streamRequest(["hello ", "world"]),
            64,
        );
        expect(new TextDecoder().decode(bytes)).toBe("hello world");
    });

    test("rejects a chunked body over the cap even without content-length", async () => {
        await expect(
            readRequestBody(streamRequest(["1234", "5678", "9"]), 8),
        ).rejects.toBeInstanceOf(BodyTooLargeError);
    });

    test("rejects a declared content-length over the cap immediately", async () => {
        await expect(
            readRequestBody(streamRequest([], { "content-length": "999" }), 8),
        ).rejects.toBeInstanceOf(BodyTooLargeError);
    });
});

describe("readJsonBody / readFormDataBody", () => {
    test("parses JSON within the cap", async () => {
        const body = await readJsonBody<{ ok: boolean }>(
            streamRequest(['{"ok":true}']),
            32,
        );
        expect(body).toEqual({ ok: true });
    });

    test("re-parses multipart form data after applying the cap", async () => {
        const form = new FormData();
        form.append("name", "mimi");
        form.append(
            "file",
            new File(["bytes"], "x.txt", { type: "text/plain" }),
        );
        const request = new Request("http://api/test", {
            method: "POST",
            body: form,
        });
        const parsed = await readFormDataBody(request, 1024 * 1024);
        expect(parsed.get("name")).toBe("mimi");
        expect((parsed.get("file") as File).name).toBe("x.txt");
    });
});
