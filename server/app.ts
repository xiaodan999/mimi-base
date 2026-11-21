/**
 * Elysia application factory (spike).
 *
 * This is the STEP 0 proof: a root `onRequest` guard that can answer before
 * any body is read, a root `onParse` that owns the byte cap and JSON/FormData
 * parsing, JSON + SSE routes, and an `all("/*")` static fallback.
 */

import { Elysia } from "elysia";

import {
    BodyTooLargeError,
    readFormDataBody,
    readJsonBody,
} from "./request-body";

const API_CAP_BYTES = 64 * 1024;
const AUTHORIZED = "good-token";

export type SpikeCounters = { parseCalls: number };

export function createApp(counters: SpikeCounters = { parseCalls: 0 }) {
    return new Elysia()
        .onRequest(({ request, set }) => {
            const url = new URL(request.url);
            if (
                request.method === "OPTIONS" &&
                url.pathname.startsWith("/api/")
            ) {
                set.headers["access-control-allow-origin"] = "*";
                return new Response(null, { status: 204 });
            }
            if (
                url.pathname.startsWith("/api/") &&
                url.pathname !== "/api/health"
            ) {
                const token = (request.headers.get("authorization") ?? "")
                    .replace(/^bearer\s+/i, "")
                    .trim();
                if (token !== AUTHORIZED) {
                    return Response.json(
                        { error: { message: "unauthorized" } },
                        { status: 401 },
                    );
                }
            }
            return undefined;
        })
        .onParse(async ({ request }) => {
            counters.parseCalls += 1;
            const method = request.method.toUpperCase();
            if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
                return undefined;
            }
            const url = new URL(request.url);
            if (!url.pathname.startsWith("/api/")) return undefined;
            const type = request.headers.get("content-type") ?? "";
            if (type.includes("multipart/form-data")) {
                return readFormDataBody(request, API_CAP_BYTES);
            }
            return readJsonBody(request, API_CAP_BYTES);
        })
        .onError(({ code, error, set }) => {
            // Elysia wraps anything thrown from onParse in a ParseError and
            // keeps the real error on `cause`.
            const cause =
                error instanceof Error
                    ? (error as Error & { cause?: unknown }).cause
                    : undefined;
            const real =
                error instanceof Error && code === "PARSE" && cause
                    ? cause
                    : error;
            if (real instanceof BodyTooLargeError) {
                set.status = 413;
                return { error: { message: "请求体过大" } };
            }
            if (
                code === "PARSE" ||
                real instanceof SyntaxError ||
                error instanceof SyntaxError
            ) {
                set.status = 400;
                return { error: { message: "请求体不是合法的 JSON" } };
            }
            return undefined;
        })
        .get("/api/health", () => ({ ok: true }))
        .get("/api/json", () => ({ hello: "world" }))
        .get("/api/sse", () => {
            const encoder = new TextEncoder();
            const stream = new ReadableStream<Uint8Array>({
                async start(controller) {
                    controller.enqueue(encoder.encode("a"));
                    await Bun.sleep(10);
                    controller.enqueue(encoder.encode("b"));
                    controller.close();
                },
            });
            return new Response(stream, {
                headers: { "content-type": "text/event-stream" },
            });
        })
        .post("/api/echo", ({ body }) => {
            if (body instanceof FormData) {
                const file = body.get("file");
                return {
                    kind: "form",
                    name: file instanceof File ? file.name : "",
                    size: file instanceof File ? file.size : 0,
                    fields: [...body.keys()],
                };
            }
            return { kind: "json", body: body ?? null };
        })
        .all(
            "/*",
            ({ request }) =>
                new Response(
                    `static:${request.method}:${new URL(request.url).pathname}`,
                ),
        );
}
