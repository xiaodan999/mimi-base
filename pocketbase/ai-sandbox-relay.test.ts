import { describe, expect, test } from "bun:test";

import { AI_SANDBOX_PATH, createAiRelay, type AiRelayDeps } from "./ai-relay";
import type { SandboxRequest, SandboxResponse } from "../lib/sandbox-protocol";

const PB_BASE = "http://127.0.0.1:8090";

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function authHeader(init?: RequestInit): string {
    const headers = init?.headers;
    if (!headers) return "";
    if (headers instanceof Headers) return headers.get("authorization") ?? "";
    const record = headers as Record<string, string>;
    return record.Authorization ?? record.authorization ?? "";
}

const authFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/auth-refresh")) {
        return authHeader(init) === "good-token"
            ? json({ record: { id: "user-1" } })
            : json({ message: "invalid" }, 401);
    }
    return json({ ok: true });
}) as typeof fetch;

function request(body: unknown, token = "good-token"): Request {
    return new Request(`http://relay.test${AI_SANDBOX_PATH}`, {
        method: "POST",
        headers: {
            ...(token ? { Authorization: token } : {}),
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
}

function harness(
    run: (request: SandboxRequest) => Promise<SandboxResponse>,
    available = () => true,
) {
    const deps: AiRelayDeps = {
        pbBaseUrl: PB_BASE,
        apiKey: "server-key",
        model: "deepseek-v4.1-flash",
        dailyLimit: 0,
        fetch: authFetch,
        sandbox: { run, available },
    };
    return createAiRelay(deps);
}

describe("sandbox relay", () => {
    test("requires a PocketBase token", async () => {
        const relay = harness(async () => ({
            ok: true,
            logs: [],
            files: {},
            durationMs: 1,
        }));
        const res = await relay(request({ op: "list" }, ""));
        expect(res?.status).toBe(401);
    });

    test("reports 503 while the sandbox is not ready", async () => {
        const relay = harness(
            async () => ({
                ok: true,
                logs: [],
                files: {},
                durationMs: 1,
            }),
            () => false,
        );
        const res = await relay(request({ op: "list" }));
        expect(res?.status).toBe(503);
    });

    test("forwards the operation and returns the runner response", async () => {
        let captured: SandboxRequest | undefined;
        const relay = harness(async (value) => {
            captured = value;
            return {
                ok: true,
                result: "hi",
                logs: ["logged"],
                files: { "a.txt": "x" },
                durationMs: 12,
            };
        });
        const res = await relay(
            request({
                op: "run",
                language: "javascript",
                code: 'return "hi"',
                files: { "a.txt": "x" },
            }),
        );
        expect(res?.status).toBe(200);
        expect(captured).toMatchObject({
            op: "run",
            language: "javascript",
            code: 'return "hi"',
        });
        expect(await res?.json()).toEqual({
            ok: true,
            result: "hi",
            logs: ["logged"],
            files: { "a.txt": "x" },
            durationMs: 12,
        });
    });

    test("rejects an unknown operation", async () => {
        let called = false;
        const relay = harness(async () => {
            called = true;
            return { ok: true, logs: [], files: {}, durationMs: 1 };
        });
        const res = await relay(request({ op: "exec" }));
        expect(res?.status).toBe(400);
        expect(called).toBe(false);
    });

    test("rejects an unknown language", async () => {
        let called = false;
        const relay = harness(async () => {
            called = true;
            return { ok: true, logs: [], files: {}, durationMs: 1 };
        });
        const res = await relay(
            request({ op: "run", language: "ruby", code: "return 1" }),
        );
        expect(res?.status).toBe(400);
        expect(called).toBe(false);
    });

    test("limits each user to one running sandbox", async () => {
        const gate: {
            release: ((response: SandboxResponse) => void) | null;
        } = { release: null };
        const relay = harness(
            () =>
                new Promise<SandboxResponse>((resolve) => {
                    gate.release = resolve;
                }),
        );
        const first = relay(request({ op: "run", code: "print(1)" }));
        await new Promise((resolve) => setTimeout(resolve, 20));
        const second = await relay(request({ op: "run", code: "print(2)" }));
        expect(second?.status).toBe(429);
        gate.release?.({
            ok: true,
            logs: [],
            files: {},
            durationMs: 1,
        });
        expect((await first)?.status).toBe(200);
    });
});
