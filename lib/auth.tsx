import {
    type ReactNode,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";

import pb, { clearFileToken, ensureFileToken } from "./pb";
import { toUser, type Circle, type User, type UserRecord } from "./pb-types";

// `User` / `Circle` are centralized in lib/pb-types.ts; re-export them so the
// rest of the app keeps importing them from `@/lib/auth`.
export type { User, Circle };

/**
 * `loading` only covers the initial session restore. Once it settles the
 * status becomes either "authenticated" or "anonymous" for the rest of the
 * session.
 */
export type AuthStatus = "loading" | "authenticated" | "anonymous";

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

    const waitForAuth = useCallback(async () => {
        await readyRef.current!;
        return snapshotRef.current;
    }, []);

    const login = useCallback(
        async (credentials: { email: string; password: string }) => {
            try {
                await pb
                    .collection("users")
                    .authWithPassword(credentials.email, credentials.password);
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

    return (
        <AuthContext.Provider
            value={{
                status: snapshot.status,
                isAuthenticated: snapshot.status === "authenticated",
                user: snapshot.user,
                login,
                logout,
                refresh,
                waitForAuth,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
