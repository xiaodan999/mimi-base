/**
 * One bearer-token authenticator for every API service.
 *
 * The browser sends its PocketBase user token; the server validates it once
 * through `auth-refresh` (5s timeout), caches the result by token hash for a
 * minute and funnels every refresh through the shared concurrency gate. The
 * root `onRequest` hook runs this before any body is parsed and stores the
 * result on the Request, so route handlers only read the cached value.
 */

import { createHash } from "node:crypto";

import { AuthBusyError, authGate } from "../auth-gate";
import { errorBody, HttpError } from "./errors";
import { jsonResponse } from "./response";

const AUTH_CACHE_MS = 60_000;
const AUTH_CACHE_MAX = 1000;
const AUTH_TIMEOUT_MS = 5_000;

export type AuthUser = { uid: string; token: string };

export type AuthFailureReason =
    "unauthorized" | "busy" | "network" | "upstream";

export type AuthFailure = {
    ok: false;
    status: 401 | 503;
    reason: AuthFailureReason;
    message: string;
    code: string;
};

export type AuthResult = { ok: true; auth: AuthUser } | AuthFailure;

export type AuthenticatorOptions = {
    /** PocketBase origin, no `/db` suffix. */
    pbBaseUrl: string;
    fetch?: typeof fetch;
    now?: () => number;
    cacheMs?: number;
    maxCache?: number;
};

export type Authenticator = (request: Request) => Promise<AuthResult>;

const authByRequest = new WeakMap<Request, AuthUser>();

function bearerToken(request: Request): string {
    const header = request.headers.get("authorization")?.trim() ?? "";
    return header.replace(/^bearer\s+/i, "").trim();
}

/**
 * Services fail differently on an unavailable PB: AI calls it "starting",
 * feedback/video distinguish a network failure from an upstream 5xx. Keep
 * those messages stable; only the envelope around them changed.
 */
export function authFailureForPath(
    pathname: string,
    reason: AuthFailureReason,
): AuthFailure {
    if (reason === "unauthorized") {
        return {
            ok: false,
            status: 401,
            reason,
            message: "登录已过期，请重新登录",
            code: "unauthorized",
        };
    }
    if (reason === "busy") {
        return {
            ok: false,
            status: 503,
            reason,
            message: "登录验证服务繁忙，稍后再试",
            code: "auth_busy",
        };
    }
    const ai = pathname.startsWith("/api/ai");
    if (ai) {
        return {
            ok: false,
            status: 503,
            reason,
            message: "AI 服务正在启动，稍后再试",
            code: "service_unavailable",
        };
    }
    if (reason === "network") {
        return {
            ok: false,
            status: 503,
            reason,
            message: "无法验证登录状态",
            code: "service_unavailable",
        };
    }
    const video = pathname.startsWith("/api/video");
    return {
        ok: false,
        status: 503,
        reason,
        message: video ? "视频服务暂时不可用" : "反馈服务暂时不可用",
        code: "service_unavailable",
    };
}

export function createAuthenticator(
    options: AuthenticatorOptions,
): Authenticator {
    const fetchImpl = options.fetch ?? fetch;
    const now = options.now ?? Date.now;
    const cacheMs = options.cacheMs ?? AUTH_CACHE_MS;
    const maxCache = Math.max(1, options.maxCache ?? AUTH_CACHE_MAX);
    const cache = new Map<string, { uid: string; expiresAt: number }>();

    async function refresh(
        request: Request,
        token: string,
    ): Promise<AuthResult> {
        const pathname = new URL(request.url).pathname;
        const cacheKey = createHash("sha256").update(token).digest("hex");
        const cached = cache.get(cacheKey);
        if (cached && now() < cached.expiresAt) {
            const auth = { uid: cached.uid, token };
            authByRequest.set(request, auth);
            return { ok: true, auth };
        }

        let response: Response;
        try {
            response = await authGate(() =>
                fetchImpl(
                    `${options.pbBaseUrl}/api/collections/users/auth-refresh`,
                    {
                        method: "POST",
                        headers: { Authorization: token },
                        signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
                    },
                ),
            );
        } catch (error) {
            const reason: AuthFailureReason =
                error instanceof AuthBusyError ? "busy" : "network";
            return authFailureForPath(pathname, reason);
        }

        if (response.status === 401 || response.status === 403) {
            cache.delete(cacheKey);
            return authFailureForPath(pathname, "unauthorized");
        }
        if (!response.ok) {
            return authFailureForPath(pathname, "upstream");
        }

        let uid = "";
        try {
            const body = (await response.json()) as {
                record?: { id?: unknown };
            };
            if (typeof body.record?.id === "string") uid = body.record.id;
        } catch {
            // fall through to the unauthenticated result
        }
        if (!uid) return authFailureForPath(pathname, "unauthorized");

        if (cache.size >= maxCache) cache.clear();
        cache.set(cacheKey, { uid, expiresAt: now() + cacheMs });
        const auth = { uid, token };
        authByRequest.set(request, auth);
        return { ok: true, auth };
    }

    return async (request: Request): Promise<AuthResult> => {
        const existing = authByRequest.get(request);
        if (existing) return { ok: true, auth: existing };

        const token = bearerToken(request);
        if (!token) {
            return authFailureForPath(
                new URL(request.url).pathname,
                "unauthorized",
            );
        }
        return refresh(request, token);
    };
}

/** The authenticated user stored by the root hook, if any. */
export function getRequestAuth(request: Request): AuthUser | undefined {
    return authByRequest.get(request);
}

/** Route handlers call this: a missing auth is a contract violation. */
export function requireAuth(auth: AuthUser | null | undefined): AuthUser {
    if (!auth) {
        throw new HttpError(401, "登录已过期，请重新登录", {
            code: "unauthorized",
        });
    }
    return auth;
}

/** Paths that the root guard authenticates before the body is read. */
export function requiresAuth(pathname: string): boolean {
    if (pathname === "/api/ai/health") return false;
    return (
        pathname === "/api/ai" ||
        pathname.startsWith("/api/ai/") ||
        pathname === "/api/feedback" ||
        pathname.startsWith("/api/feedback/") ||
        pathname === "/api/video" ||
        pathname.startsWith("/api/video/")
    );
}

/** Turn an auth failure into the unified 401/503 envelope. */
export function authFailureResponse(
    request: Request,
    failure: AuthFailure,
): Response {
    return jsonResponse(
        request,
        errorBody(request, failure.message, failure.code),
        { status: failure.status },
    );
}
