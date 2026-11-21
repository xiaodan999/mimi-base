/**
 * Shared helpers for the server tests.
 *
 * Before the Elysia migration every test file carried its own `json()` and
 * auth-refresh stub. This module keeps one fake PocketBase fetch, one request
 * builder and one temp static directory so route tests exercise the real
 * root hooks (auth before parse, unified errors) with a minimal setup.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

export function authHeader(init?: RequestInit): string {
    const headers = init?.headers;
    if (!headers) return "";
    if (headers instanceof Headers) {
        return headers.get("authorization") ?? "";
    }
    const record = headers as Record<string, string>;
    return record.Authorization ?? record.authorization ?? "";
}

export type FakePbOptions = {
    /** Token accepted by the auth-refresh stub. */
    token?: string;
    /** User id returned on success. */
    uid?: string;
    /** Called for every auth-refresh request (counters live here). */
    onAuth?: (init?: RequestInit) => void;
};

/**
 * Wrap a PB/GitHub handler with a PocketBase auth-refresh stub. The handler
 * only sees non-auth paths, so each test keeps its specific routes.
 */
export function fakePbFetch(
    handler: (url: URL, init?: RequestInit) => Response | Promise<Response>,
    options: FakePbOptions = {},
): typeof fetch {
    const token = options.token ?? "pb-token";
    const uid = options.uid ?? "user1234567890";
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname === "/api/collections/users/auth-refresh") {
            options.onAuth?.(init);
            return authHeader(init) === token
                ? json({ record: { id: uid } })
                : json({ message: "invalid" }, 401);
        }
        return handler(url, init);
    }) as typeof fetch;
}

export type RequestOptions = {
    method?: string;
    token?: string | null;
    body?: BodyInit | null;
    headers?: Record<string, string>;
};

export function apiRequest(
    pathname: string,
    options: RequestOptions = {},
): Request {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.token !== null) {
        headers.Authorization = options.token ?? "pb-token";
    }
    return new Request(`http://api.test${pathname}`, {
        method: options.method ?? "POST",
        headers,
        ...(options.body !== undefined ? { body: options.body } : {}),
    });
}

export function jsonRequest(
    pathname: string,
    body: unknown,
    options: Omit<RequestOptions, "body"> = {},
): Request {
    return apiRequest(pathname, {
        ...options,
        headers: {
            "content-type": "application/json",
            ...(options.headers ?? {}),
        },
        body: JSON.stringify(body),
    });
}

export type TempStaticDir = {
    dir: string;
    cleanup: () => void;
};

/** A tiny SPA tree for the static fallback tests. */
export function tempStaticDir(
    files: Record<string, string> = {
        "index.html": "<!doctype html><title>mimi</title>",
        "assets/app.js": "console.log('app')",
        "manifest.json": "{}",
    },
): TempStaticDir {
    const dir = mkdtempSync(path.join(tmpdir(), "mimi-static-"));
    for (const [relative, content] of Object.entries(files)) {
        const target = path.join(dir, relative);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, content);
    }
    return {
        dir,
        cleanup: () => rmSync(dir, { recursive: true, force: true }),
    };
}
