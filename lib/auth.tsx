import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import { type DevAccount, findDevAccount } from "./dev-accounts";
import pb, { clearFileToken, ensureFileToken } from "./pb";
import { type Circle, toUser, type User, type UserRecord } from "./pb-types";

// `User` / `Circle` are centralized in lib/pb-types.ts; re-export them so the
// rest of the app keeps importing them from `@/lib/auth`.
export type { User, Circle };

/**
 * `loading` only covers the initial session restore. Once it settles the
 * status becomes either "authenticated" or "anonymous" for the rest of the
 * session.
 */
export type AuthStatus = "loading" | "authenticated" | "anonymous";

const AUTH_TIMEOUT_MS = 12_000;

export type AuthSnapshot = {
    status: AuthStatus;
    user: User | null;
};

export type AuthContextType = {
    status: AuthStatus;
    isAuthenticated: boolean;
    user: User | null;
    login: (credentials: {
        email: string;
        password: string;
    }) => Promise<{ error: { message: string } | null }>;
    logout: () => Promise<void>;
    refresh: () => void;
    /**
     * Waits for the initial session restore and returns the settled state.
     * Route guards use this instead of guessing from a stale render.
     */
    waitForAuth: () => Promise<AuthSnapshot>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (ctx === null)
        throw new Error("useAuth can only be used in AuthProvider");

    return ctx;
}

/**
 * Same as `useAuth().user`, but for screens that are already behind the
 * protected route. Throws instead of forcing every caller to handle null.
 */
export function useCurrentUser(): User {
    const { user } = useAuth();
    if (!user) {
        throw new Error(
            "useCurrentUser can only be used inside a protected route",
        );
    }
    return user;
}

/**
 * Ensure the browser is signed in as the dev account behind a `?dev=` key.
 * A different session is replaced in place (no intermediate anonymous state,
 * so the protected shell keeps rendering). Returns `ok: false` for an unknown
 * key (or a failed sign-in) so callers can fall back to the form.
 */
export async function ensureDevSession(
    auth: Pick<AuthContextType, "waitForAuth" | "login">,
    key: string | null | undefined,
): Promise<
    | { ok: true; account: DevAccount }
    | { ok: false; account: DevAccount | null; error?: string }
> {
    const account = findDevAccount(key);
    if (!account) return { ok: false, account: null };

    const snapshot = await auth.waitForAuth();
    if (
        snapshot.status === "authenticated" &&
        pb.authStore.record?.email === account.email
    ) {
        return { ok: true, account };
    }

    const { error } = await auth.login({
        email: account.email,
        password: account.password,
    });
    return error
        ? { ok: false, account, error: error.message }
        : { ok: true, account };
}

const fetchUser = async (id: string): Promise<User | null> => {
    // `pb.authStore.record` has no expand, so fetch the profile with the
    // expanded circle for the avatar / circle rendering.
    try {
        const record = await pb.collection("users").getOne<UserRecord>(id, {
            expand: "circle",
        });
        return toUser(record);
    } catch (error) {
        console.log("Failed to fetch the user profile", error);
        return null;
    }
};

export function AuthProvider({ children }: { children: ReactNode }) {
    const [snapshot, setSnapshot] = useState<AuthSnapshot>({
        status: "loading",
        user: null,
    });

    // Refs mirror the latest state so `waitForAuth` can resolve with fresh
    // values even when the router still holds an old context snapshot.
    const snapshotRef = useRef(snapshot);
    const renderedRef = useRef(snapshot);
    const renderedWaiters = useRef<(() => void)[]>([]);
    const readyRef = useRef<Promise<void> | null>(null);
    const resolveReady = useRef<(() => void) | null>(null);
    const pendingLoad = useRef<Promise<void> | null>(null);

    if (readyRef.current === null) {
        readyRef.current = new Promise<void>((resolve) => {
            resolveReady.current = resolve;
        });
    }

    const commit = useCallback((next: AuthSnapshot) => {
        snapshotRef.current = next;
        setSnapshot(next);
    }, []);

    const loadUser = useCallback(() => {
        if (pendingLoad.current) return pendingLoad.current;

        const run = (async () => {
            const record = pb.authStore.record;
            if (!pb.authStore.isValid || !record?.id) {
                clearFileToken();
                commit({ status: "anonymous", user: null });
                resolveReady.current?.();
                return;
            }

            try {
                // Protected files need a token before any avatar/image renders.
                const [data] = await Promise.all([
                    fetchUser(record.id),
                    ensureFileToken(true),
                ]);
                commit(
                    data
                        ? { status: "authenticated", user: data }
                        : { status: "anonymous", user: null },
                );
            } finally {
                // The initial restore is done either way.
                resolveReady.current?.();
            }
        })().finally(() => {
            pendingLoad.current = null;
        });

        pendingLoad.current = run;
        return run;
    }, [commit]);

    const wakeRenderedWaiters = useCallback(() => {
        const waiters = renderedWaiters.current;
        renderedWaiters.current = [];
        for (const resolve of waiters) resolve();
    }, []);

    const waitForAuth = useCallback(async () => {
        await readyRef.current!;
        // Callers must branch on the same snapshot the provider has rendered.
        // A commit updates the ref before React re-renders, so a guard reading
        // the ref could let `/home` through while `useAuth()` still renders
        // `anonymous`; the protected layout would bounce back to /login.
        // If the latest commit has not reached React yet, wait for the commit
        // effect once and return the snapshot that is actually on screen.
        if (renderedRef.current !== snapshotRef.current) {
            await new Promise<void>((resolve) => {
                renderedWaiters.current.push(resolve);
            });
        }
        return renderedRef.current;
    }, []);

    // Publish the snapshot only once React has committed it, then wake any
    // guard waiting in `waitForAuth`.
    useEffect(() => {
        renderedRef.current = snapshot;
        wakeRenderedWaiters();
    }, [snapshot, wakeRenderedWaiters]);

    // On unmount nothing will publish another snapshot; release any guard that
    // is still parked so a route load cannot wait forever.
    useEffect(() => wakeRenderedWaiters, [wakeRenderedWaiters]);

    const login = useCallback(
        async (credentials: { email: string; password: string }) => {
            try {
                // A dev proxy can leave a request on a dead keep-alive socket
                // forever; fail the attempt instead of spinning the button.
                await Promise.race([
                    pb
                        .collection("users")
                        .authWithPassword(
                            credentials.email,
                            credentials.password,
                        ),
                    new Promise<never>((_, reject) => {
                        window.setTimeout(
                            () => reject(new Error("登录超时，请重试")),
                            AUTH_TIMEOUT_MS,
                        );
                    }),
                ]);
                // Wait for the profile fetch so the next route guard sees the
                // authenticated state immediately after navigation.
                await loadUser();
                if (snapshotRef.current.status !== "authenticated") {
                    return {
                        error: {
                            message: "登录成功，但读取个人资料失败，请重试",
                        },
                    };
                }
                return { error: null };
            } catch (error) {
                return { error: error as { message: string } };
            }
        },
        [loadUser],
    );

    const logout = useCallback(async () => {
        pb.authStore.clear();
        clearFileToken();
        await loadUser();
    }, [loadUser]);

    const refresh = useCallback(() => {
        void loadUser();
    }, [loadUser]);

    useEffect(() => {
        void loadUser();
        // Session restore and login/logout both flow through the auth store.
        return pb.authStore.onChange(() => {
            void loadUser();
        });
    }, [loadUser]);

    useEffect(() => {
        if (snapshot.status !== "authenticated") return;
        // File tokens expire after 3 minutes; refresh ahead of time so newly
        // rendered avatars and images always get a valid URL.
        const timer = window.setInterval(() => {
            void ensureFileToken(true);
        }, 120_000);
        return () => window.clearInterval(timer);
    }, [snapshot.status]);

    // Keep the context identity stable unless auth actually changes; a new
    // object on every render makes the router re-read its context.
    const value = useMemo<AuthContextType>(
        () => ({
            status: snapshot.status,
            isAuthenticated: snapshot.status === "authenticated",
            user: snapshot.user,
            login,
            logout,
            refresh,
            waitForAuth,
        }),
        [snapshot.status, snapshot.user, login, logout, refresh, waitForAuth],
    );

    return (
        <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
}
