/**
 * Global concurrency gate for PocketBase auth-refresh calls.
 *
 * Every API service authenticates a bearer token by forwarding it to
 * PocketBase. Without a shared gate, a flood of random tokens turns into one
 * PB request per API request on a 2-core box. Excess attempts get a retryable
 * 503 instead of starving the event loop (and the PB container).
 */

export class AuthBusyError extends Error {
    constructor() {
        super("登录验证服务繁忙");
        this.name = "AuthBusyError";
    }
}

export type AuthGate = <T>(task: () => Promise<T>) => Promise<T>;

export function createAuthGate(maxConcurrent = 6): AuthGate {
    const limit = Math.max(1, maxConcurrent);
    let active = 0;
    return async <T>(task: () => Promise<T>): Promise<T> => {
        if (active >= limit) throw new AuthBusyError();
        active += 1;
        try {
            return await task();
        } finally {
            active -= 1;
        }
    };
}

/** Shared by ai-relay, feedback and video in one process. */
export const authGate = createAuthGate(6);
