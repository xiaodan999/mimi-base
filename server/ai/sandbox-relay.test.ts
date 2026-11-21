import { describe, expect, test } from "bun:test";

import type {
    SandboxRequest,
    SandboxResponse,
} from "../../lib/sandbox-protocol";
import { createApp } from "../app";
import { AI_SANDBOX_PATH } from "../routes/ai";
import { apiRequest, authHeader, json } from "../test-helpers";
import type { AiRelayDeps } from "./relay";

const PB_BASE = "http://127.0.0.1:8090";

const authFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/auth-refresh")) {
        return authHeader(init) === "good-token"
            ? json({ record: { id: "user-1" } })
            : json({ message: "invalid" }, 401);
    }
    return json({ ok: true });
}) as typeof fetch;

function request(body: unknown, token: string | null = "good-token"): Request {
    return apiRequest(AI_SANDBOX_PATH, {
        token,
        headers: { "Content-Type": "application/json" },
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
    return createApp({ pbBaseUrl: PB_BASE, ai: deps });
}

describe("sandbox relay", () => {
    test("requires a PocketBase token", async () => {
        const app = harness(async () => ({
            ok: true,
            logs: [],
            files: {},
            artifacts: [],
            durationMs: 1,
        }));
        const res = await app.handle(request({ op: "list" }, null));
        expect(res.status).toBe(401);
    });

    test("reports 503 while the sandbox is not ready", async () => {
        const app = harness(
            async () => ({
                ok: true,
                logs: [],
                files: {},
                artifacts: [],
                durationMs: 1,
            }),
            () => false,
        );
        const res = await app.handle(request({ op: "list" }));
        expect(res.status).toBe(503);
    });

    test("forwards the operation and returns the runner response", async () => {
        let captured: SandboxRequest | undefined;
        const app = harness(async (value) => {
            captured = value;
            return {
                ok: true,
                result: "hi",
                logs: ["logged"],
                files: { "a.txt": "x" },
                artifacts: [],
                durationMs: 12,
            };
        });
        const res = await app.handle(
            request({
                op: "run",
                language: "javascript",
                code: 'return "hi"',
                files: { "a.txt": "x" },
            }),
        );
        expect(res.status).toBe(200);
        expect(captured).toMatchObject({
            op: "run",
            language: "javascript",
            code: 'return "hi"',
        });
        expect(await res.json()).toEqual({
            ok: true,
            result: "hi",
            logs: ["logged"],
            files: { "a.txt": "x" },
            artifacts: [],
            durationMs: 12,
        });
    });

    test("rejects an unknown operation", async () => {
        let called = false;
        const app = harness(async () => {
            called = true;
            return {
                ok: true,
                logs: [],
                files: {},
                artifacts: [],
                durationMs: 1,
            };
        });
        const res = await app.handle(request({ op: "exec" }));
        expect(res.status).toBe(400);
        expect(called).toBe(false);
    });

    test("rejects python and unknown languages", async () => {
        let called = false;
        const app = harness(async () => {
            called = true;
            return {
                ok: true,
                logs: [],
                files: {},
                artifacts: [],
                durationMs: 1,
            };
        });
        for (const language of ["python", "ruby"]) {
            const res = await app.handle(
                request({ op: "run", language, code: "return 1" }),
            );
            expect(res.status).toBe(400);
        }
        expect(called).toBe(false);
    });

    test("limits each user to one running sandbox", async () => {
        const gate: {
            release: ((response: SandboxResponse) => void) | null;
        } = { release: null };
        const app = harness(
            () =>
                new Promise<SandboxResponse>((resolve) => {
                    gate.release = resolve;
                }),
        );
        const first = app.handle(request({ op: "run", code: "print(1)" }));
        await new Promise((resolve) => setTimeout(resolve, 20));
        const second = await app.handle(
            request({ op: "run", code: "print(2)" }),
        );
        expect(second.status).toBe(429);
        gate.release?.({
            ok: true,
            logs: [],
            files: {},
            artifacts: [],
            durationMs: 1,
        });
        expect((await first).status).toBe(200);
    });
});
