import { useMemo, useSyncExternalStore } from "react";

import {
    type AuthSnapshot,
    type AuthStore,
    createAuthStore,
} from "./auth-store";
import { type DevAccount, findDevAccount } from "./dev-accounts";
import pb, { clearFileToken, ensureFileToken } from "./pb";
import { toUser, type User, type UserRecord } from "./pb-types";

// `User` is centralized in lib/pb-types.ts; re-export it so consumers keep
// importing it from `@/lib/auth`.
export type { User } from "./pb-types";

/**
 * A 401/403/404 means the credential or the account is gone. Anything else
 * (offline, DNS, 5xx, timeout) is transient: signing out here would strand a
 * valid session on the login page until a full reload.
 */
function isCredentialGone(error: unknown): boolean {
    const status = (error as { status?: unknown } | null)?.status;
    return status === 401 || status === 403 || status === 404;
}

const fetchUserProfile = async (id: string): Promise<User | null> => {
    // `pb.authStore.record` has no expand, so fetch the profile with the
    // expanded circle for the avatar / circle rendering.
    try {
        const record = await pb.collection("users").getOne<UserRecord>(id, {
            expand: "circle",
        });
        return toUser(record);
    } catch (error) {
        // Keep the last credential record as a stale profile while the
        // network is down; a later refresh replaces it with expanded data.
        if (!isCredentialGone(error)) {
            const stored = pb.authStore.record;
            if (stored?.id === id) {
                return toUser(stored as UserRecord);
            }
        }
        console.log("Failed to fetch the user profile", error);
        return null;
    }
};

/**
 * The app's auth state: PocketBase holds the credential, this store holds the
 * profile. One instance for the whole app, created before the first render so
 * route guards and components can never disagree about who is signed in.
 */
export const auth: AuthStore = createAuthStore({
    client: {
        isValid: () => pb.authStore.isValid,
        userId: () => pb.authStore.record?.id ?? null,
        authenticate: (email, password) =>
            pb.collection("users").authWithPassword(email, password),
        clear: () => pb.authStore.clear(),
        onChange: (listener) => pb.authStore.onChange(listener),
    },
    fetchUser: fetchUserProfile,
    fileTokens: { ensure: ensureFileToken, clear: clearFileToken },
});

export type AuthState = AuthSnapshot & {
    isAuthenticated: boolean;
    login: AuthStore["login"];
    logout: AuthStore["logout"];
    refresh: AuthStore["refresh"];
    waitForAuth: AuthStore["waitForAuth"];
};

/**
 * The current snapshot plus the auth actions. Re-renders only when the
 * credential or the profile actually changes.
 */
export function useAuth(): AuthState {
    const snapshot = useSyncExternalStore(auth.subscribe, auth.getSnapshot);
    return useMemo(
        () => ({
            ...snapshot,
            isAuthenticated: snapshot.status === "authenticated",
            login: auth.login,
            logout: auth.logout,
            refresh: auth.refresh,
            waitForAuth: auth.waitForAuth,
        }),
        [snapshot],
    );
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
    store: Pick<AuthStore, "login" | "waitForAuth">,
    key: string | null | undefined,
): Promise<
    | { ok: true; account: DevAccount }
    | { ok: false; account: DevAccount | null; error?: string }
> {
    const account = findDevAccount(key);
    if (!account) return { ok: false, account: null };

    const snapshot = await store.waitForAuth();
    if (
        snapshot.status === "authenticated" &&
        snapshot.user?.email === account.email
    ) {
        return { ok: true, account };
    }

    const { error } = await store.login({
        email: account.email,
        password: account.password,
    });
    return error
        ? { ok: false, account, error: error.message }
        : { ok: true, account };
}
