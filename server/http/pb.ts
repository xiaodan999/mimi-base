/**
 * One PocketBase REST client for the API.
 *
 * The data tools, feedback service and issue-state sync all talk to the same
 * PB origin with the caller's token; feedback additionally needs a superuser
 * token to persist server-owned fields on shared suggestions. Keeping the URL,
 * timeout, query building and superuser single-flight in one place avoids the
 * three slightly different copies this replaced.
 */

import { type Logger, logger as defaultLogger } from "./logger";

export type PbQuery = Record<string, string>;

export type PbRequestOptions = {
    method: string;
    token: string;
    query?: PbQuery;
    body?: string;
    timeoutMs?: number;
};

export type PbResult<T> = { ok: true; data: T } | { ok: false; status: number };

export type PbClientOptions = {
    /** PocketBase origin without a trailing slash, e.g. http://mimi-pb:8090. */
    baseUrl: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
    adminEmail?: string;
    adminPassword?: string;
    logger?: Logger;
};

export type PbClient = {
    /** Raw request, used by the data tools where the Response status matters. */
    request(path: string, options: PbRequestOptions): Promise<Response>;
    get<T>(
        path: string,
        token: string,
        options?: { query?: PbQuery; timeoutMs?: number },
    ): Promise<PbResult<T>>;
    patchStatus(
        path: string,
        body: Record<string, unknown>,
        token: string,
    ): Promise<number>;
    patch(
        path: string,
        body: Record<string, unknown>,
        token: string,
    ): Promise<boolean>;
    /** Superuser token for server-owned writes; empty when not configured. */
    getAdminToken(): Promise<string>;
    invalidateAdminToken(): void;
    /** Admin token first, caller token as the last resort. */
    patchReport(
        path: string,
        body: Record<string, unknown>,
        callerToken: string,
    ): Promise<boolean>;
};

const DEFAULT_TIMEOUT_MS = 10_000;

function buildUrl(baseUrl: string, path: string, query?: PbQuery): string {
    const url = new URL(path, `${baseUrl}/`);
    for (const [key, value] of Object.entries(query ?? {})) {
        url.searchParams.set(key, value);
    }
    return url.toString();
}

export function createPbClient(options: PbClientOptions): PbClient {
    const fetchImpl = options.fetch ?? fetch;
    const baseUrl = options.baseUrl.replace(/\/+$/, "");
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const log = (options.logger ?? defaultLogger).child("pb");
    const adminEmail = (options.adminEmail ?? "").trim();
    const adminPassword = options.adminPassword ?? "";
    const adminConfigured = adminEmail !== "" && adminPassword !== "";

    let adminToken = "";
    let adminInFlight: Promise<string> | null = null;

    async function request(
        path: string,
        requestOptions: PbRequestOptions,
    ): Promise<Response> {
        const headers: Record<string, string> = {
            Authorization: requestOptions.token,
        };
        if (requestOptions.body !== undefined) {
            headers["Content-Type"] = "application/json";
        }
        return fetchImpl(buildUrl(baseUrl, path, requestOptions.query), {
            method: requestOptions.method,
            headers,
            ...(requestOptions.body !== undefined
                ? { body: requestOptions.body }
                : {}),
            signal: AbortSignal.timeout(requestOptions.timeoutMs ?? timeoutMs),
        });
    }

    async function get<T>(
        path: string,
        token: string,
        getOptions: { query?: PbQuery; timeoutMs?: number } = {},
    ): Promise<PbResult<T>> {
        let response: Response;
        try {
            response = await request(path, {
                method: "GET",
                token,
                query: getOptions.query,
                timeoutMs: getOptions.timeoutMs,
            });
        } catch {
            return { ok: false, status: 0 };
        }
        if (!response.ok) return { ok: false, status: response.status };
        try {
            return { ok: true, data: (await response.json()) as T };
        } catch {
            return { ok: false, status: 0 };
        }
    }

    async function patchStatus(
        path: string,
        body: Record<string, unknown>,
        token: string,
    ): Promise<number> {
        try {
            const response = await request(path, {
                method: "PATCH",
                token,
                body: JSON.stringify(body),
            });
            return response.status;
        } catch {
            return 0;
        }
    }

    async function patch(
        path: string,
        body: Record<string, unknown>,
        token: string,
    ): Promise<boolean> {
        const status = await patchStatus(path, body, token);
        return status >= 200 && status < 300;
    }

    async function getAdminToken(): Promise<string> {
        if (!adminConfigured) return "";
        if (adminToken) return adminToken;
        if (adminInFlight) return adminInFlight;

        const pending = (async () => {
            try {
                const response = await fetchImpl(
                    `${baseUrl}/api/collections/_superusers/auth-with-password`,
                    {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                            identity: adminEmail,
                            password: adminPassword,
                        }),
                        signal: AbortSignal.timeout(timeoutMs),
                    },
                );
                if (!response.ok) {
                    log.warn("superuser login failed", {
                        status: response.status,
                    });
                    return "";
                }
                const data = (await response.json()) as { token?: unknown };
                const token = typeof data.token === "string" ? data.token : "";
                if (token) adminToken = token;
                else log.warn("superuser login returned no token");
                return token;
            } catch (error) {
                log.warn("superuser login unavailable", {
                    error:
                        error instanceof Error ? error.message : String(error),
                });
                return "";
            }
        })();

        adminInFlight = pending;
        try {
            return await pending;
        } finally {
            if (adminInFlight === pending) adminInFlight = null;
        }
    }

    function invalidateAdminToken(): void {
        adminToken = "";
    }

    async function patchReport(
        path: string,
        body: Record<string, unknown>,
        callerToken: string,
    ): Promise<boolean> {
        const admin = await getAdminToken();
        if (admin) {
            const status = await patchStatus(path, body, admin);
            if (status >= 200 && status < 300) return true;
            if (status === 401 || status === 403) {
                invalidateAdminToken();
                const retried = await getAdminToken();
                if (retried) {
                    const retriedStatus = await patchStatus(
                        path,
                        body,
                        retried,
                    );
                    if (retriedStatus >= 200 && retriedStatus < 300) {
                        return true;
                    }
                    log.warn("admin report patch failed", {
                        status: retriedStatus,
                    });
                }
            } else {
                log.warn("admin report patch failed", { status });
            }
        }
        const callerStatus = await patchStatus(path, body, callerToken);
        if (callerStatus >= 200 && callerStatus < 300) return true;
        log.warn("caller report patch failed", { status: callerStatus });
        return false;
    }

    return {
        request,
        get,
        patchStatus,
        patch,
        getAdminToken,
        invalidateAdminToken,
        patchReport,
    };
}
