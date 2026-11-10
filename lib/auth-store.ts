/**
 * The single source of truth for "who is signed in".
 *
 * PocketBase owns the credential (`pb.authStore`), but the app-facing profile
 * needs its own request: the stored record carries no `expand.circle`. This
 * store owns that profile and publishes one snapshot, so every reader —
 * components through `useAuth()`, route guards through the router context —
 * sees the same value. There is no second copy to keep in sync.
 *
 * Deliberately free of React and of `lib/pb`: the app wires the PocketBase
 * client in `lib/auth.tsx`, tests pass fakes.
 */
import type { User } from "./pb-types";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export type AuthSnapshot = {
    status: AuthStatus;
    user: User | null;
};

export type LoginResult = { error: { message: string } | null };

/** What the store needs from PocketBase. */
export type AuthClient = {
    isValid(): boolean;
    userId(): string | null;
    authenticate(email: string, password: string): Promise<unknown>;
    clear(): void;
    /** Calls `listener` whenever the stored credential changes. */
    onChange(listener: () => void): () => void;
};

export type AuthStoreDeps = {
    client: AuthClient;
    /** Full profile (with `expand.circle`); `null` when it cannot be read. */
    fetchUser(id: string): Promise<User | null>;
    /** Protected file URLs need a short-lived token, refreshed ahead of time. */
    fileTokens: {
        ensure(force: boolean): Promise<unknown>;
        clear(): void;
    };
    /** Bounds one whole login attempt (token + profile), not one request. */
    loginTimeoutMs?: number;
    fileTokenRefreshMs?: number;
    timers?: {
        setInterval(callback: () => void, ms: number): unknown;
        clearInterval(handle: unknown): void;
    };
};

export type AuthStore = {
    /** The current value; identity is stable until auth actually changes. */
    getSnapshot(): AuthSnapshot;
    subscribe(listener: () => void): () => void;
    /**
     * Reads the profile for the stored credential. Repeated calls share the
     * request already in flight.
     */
    hydrate(): Promise<AuthSnapshot>;
    /**
     * The settled snapshot for the current credential. Starts the read when
     * called first, so a route guard can await it without a bootstrap step.
     */
    waitForAuth(): Promise<AuthSnapshot>;
    login(credentials: {
        email: string;
        password: string;
    }): Promise<LoginResult>;
    logout(): Promise<void>;
    /** Re-reads the profile, e.g. after changing the nickname or avatar. */
    refresh(): void;
    /** Test teardown: stops the token heartbeat and the credential listener. */
    dispose(): void;
};

const DEFAULT_LOGIN_TIMEOUT_MS = 12_000;
const FILE_TOKEN_REFRESH_MS = 120_000;
const LOGIN_TIMEOUT_MESSAGE = "登录超时，请重试";
const PROFILE_FAILED_MESSAGE = "登录成功，但读取个人资料失败，请重试";

const defaultTimers = {
    setInterval: (callback: () => void, ms: number) =>
        setInterval(callback, ms),
    clearInterval: (handle: unknown) =>
        clearInterval(handle as ReturnType<typeof setInterval>),
};

/** Reject with `message` if `run` takes longer than `ms`. */
function withTimeout<T>(
    run: Promise<T>,
    ms: number,
    message: string,
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        run.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}

export function createAuthStore(deps: AuthStoreDeps): AuthStore {
    const {
        client,
        fetchUser,
        fileTokens,
        loginTimeoutMs = DEFAULT_LOGIN_TIMEOUT_MS,
        fileTokenRefreshMs = FILE_TOKEN_REFRESH_MS,
        timers = defaultTimers,
    } = deps;

    let snapshot: AuthSnapshot = { status: "loading", user: null };
    const listeners = new Set<() => void>();

    // Bumped whenever the credential changes. A profile read that started
    // before the bump must not publish: a stale "anonymous" answer would
    // overwrite the account that has just signed in.
    let generation = 0;
    let pending: Promise<AuthSnapshot> | null = null;
    let loadId = 0;
    let heartbeat: unknown = null;

    const syncHeartbeat = () => {
        const signedIn = snapshot.status === "authenticated";
        if (signedIn && heartbeat === null) {
            heartbeat = timers.setInterval(() => {
                void fileTokens.ensure(true);
            }, fileTokenRefreshMs);
        } else if (!signedIn && heartbeat !== null) {
            timers.clearInterval(heartbeat);
            heartbeat = null;
        }
    };

    const publish = (next: AuthSnapshot) => {
        if (next.status === snapshot.status && next.user === snapshot.user) {
            return;
        }
        snapshot = next;
        syncHeartbeat();
        for (const listener of listeners) listener();
    };

    /** Publish unless the credential changed while the read was running. */
    const commit = (next: AuthSnapshot, startedAt: number) => {
        if (startedAt === generation) publish(next);
        return snapshot;
    };

    const read = (): Promise<AuthSnapshot> => {
        if (pending) return pending;
        const id = ++loadId;
        const startedAt = generation;
        pending = (async () => {
            const userId = client.userId();
            if (!client.isValid() || !userId) {
                fileTokens.clear();
                return commit({ status: "anonymous", user: null }, startedAt);
            }

            let user: User | null = null;
            try {
                // Protected files need a token before any avatar renders.
                [user] = await Promise.all([
                    fetchUser(userId),
                    fileTokens.ensure(true),
                ]);
            } catch {
                user = null;
            }
            // A profile that cannot be read is not a valid session: the
            // screens throw on a null user, so treat it as signed out.
            return commit(
                user
                    ? { status: "authenticated", user }
                    : { status: "anonymous", user: null },
                startedAt,
            );
        })().finally(() => {
            // A newer read may have replaced this one; leave its slot alone.
            if (id === loadId) pending = null;
        });
        return pending;
    };

    /** The credential changed: whatever is in flight is already obsolete. */
    const restart = (): Promise<AuthSnapshot> => {
        generation += 1;
        pending = null;
        return read();
    };

    const waitForAuth = () => {
        if (pending) return pending;
        if (snapshot.status === "loading") return read();
        return Promise.resolve(snapshot);
    };

    const login = async (credentials: {
        email: string;
        password: string;
    }): Promise<LoginResult> => {
        try {
            await withTimeout(
                (async () => {
                    generation += 1;
                    pending = null;
                    await client.authenticate(
                        credentials.email,
                        credentials.password,
                    );
                    // PocketBase notifies `onChange` while authenticating, so
                    // this usually joins that read; it starts one otherwise.
                    await read();
                })(),
                loginTimeoutMs,
                LOGIN_TIMEOUT_MESSAGE,
            );
            return snapshot.status === "authenticated"
                ? { error: null }
                : { error: { message: PROFILE_FAILED_MESSAGE } };
        } catch (error) {
            return { error: error as { message: string } };
        }
    };

    const logout = async () => {
        generation += 1;
        pending = null;
        client.clear();
        await read();
    };

    const unsubscribe = client.onChange(() => {
        void restart();
    });

    return {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        hydrate: read,
        waitForAuth,
        login,
        logout,
        refresh: () => {
            void read();
        },
        dispose: () => {
            unsubscribe();
            if (heartbeat !== null) {
                timers.clearInterval(heartbeat);
                heartbeat = null;
            }
            listeners.clear();
        },
    };
}
