import { describe, expect, test } from "bun:test";

import {
    type AuthClient,
    type AuthStoreDeps,
    createAuthStore,
} from "./auth-store";
import type { User } from "./pb-types";

const EMAIL = "test@mimi.local";
const PASSWORD = "mimi123456";

function makeUser(id: string, email = EMAIL): User {
    return { id, email, user_name: id, tou_xiang: "", circle: "" };
}

/** A store wired to a fake credential and fake profile reads. */
function harness(deps: Partial<AuthStoreDeps> = {}) {
    const credential = { valid: false, id: null as string | null };
    const listeners = new Set<() => void>();
    const notify = () => {
        for (const listener of listeners) listener();
    };
    const client: AuthClient = {
        isValid: () => credential.valid,
        userId: () => credential.id,
        authenticate: async (email, password) => {
            if (email !== EMAIL || password !== PASSWORD) {
                throw new Error("Failed to authenticate.");
            }
            credential.valid = true;
            credential.id = "user-1";
            notify();
        },
        clear: () => {
            credential.valid = false;
            credential.id = null;
            notify();
        },
        onChange: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };

    const counters = {
        profileReads: [] as string[],
        fileTokenCalls: [] as boolean[],
        fileTokenClears: 0,
    };

    const store = createAuthStore({
        client,
        fetchUser: async (id) => {
            counters.profileReads.push(id);
            return makeUser(id);
        },
        fileTokens: {
            ensure: async (force) => {
                counters.fileTokenCalls.push(force);
                return "file-token";
            },
            clear: () => {
                counters.fileTokenClears += 1;
            },
        },
        ...deps,
    });

    return { store, client, credential, counters, notify };
}

describe("createAuthStore", () => {
    test("starts loading and settles anonymously without a credential", async () => {
        const h = harness();
        expect(h.store.getSnapshot()).toEqual({
            status: "loading",
            user: null,
        });

        const snapshot = await h.store.waitForAuth();

        expect(snapshot).toEqual({ status: "anonymous", user: null });
        expect(h.store.getSnapshot()).toBe(snapshot);
        expect(h.counters.fileTokenClears).toBe(1);
        h.store.dispose();
    });

    test("reads the profile for a stored credential", async () => {
        const h = harness();
        h.credential.valid = true;
        h.credential.id = "user-1";

        const snapshot = await h.store.hydrate();

        expect(snapshot.status).toBe("authenticated");
        expect(snapshot.user?.id).toBe("user-1");
        // Protected files need a token before the profile renders.
        expect(h.counters.fileTokenCalls).toEqual([true]);
    });

    test("shares one profile read between concurrent callers", async () => {
        const h = harness();
        h.credential.valid = true;
        h.credential.id = "user-1";

        await Promise.all([h.store.hydrate(), h.store.waitForAuth()]);

        expect(h.counters.profileReads).toEqual(["user-1"]);
    });

    test("signs out when the profile cannot be read", async () => {
        const h = harness({ fetchUser: async () => null });
        h.credential.valid = true;
        h.credential.id = "user-1";

        expect((await h.store.hydrate()).status).toBe("anonymous");
    });

    test("notifies subscribers only when the value changes", async () => {
        const h = harness();
        let renders = 0;
        h.store.subscribe(() => {
            renders += 1;
        });

        await h.store.waitForAuth();
        await h.store.waitForAuth();
        h.store.refresh();
        await h.store.waitForAuth();

        expect(renders).toBe(1);
    });

    test("login resolves after the profile and publishes the account", async () => {
        const h = harness();
        await h.store.waitForAuth();

        const result = await h.store.login({
            email: EMAIL,
            password: PASSWORD,
        });

        expect(result.error).toBeNull();
        expect(h.store.getSnapshot().status).toBe("authenticated");
        expect(h.store.getSnapshot().user?.email).toBe(EMAIL);
    });

    test("a failed login leaves the store anonymous", async () => {
        const h = harness();
        await h.store.waitForAuth();

        const result = await h.store.login({ email: EMAIL, password: "wrong" });

        expect(result.error?.message).toBe("Failed to authenticate.");
        expect(h.store.getSnapshot().status).toBe("anonymous");
    });

    test("reports a login whose profile cannot be read", async () => {
        const h = harness({ fetchUser: async () => null });

        const result = await h.store.login({
            email: EMAIL,
            password: PASSWORD,
        });

        expect(result.error?.message).toBe(
            "登录成功，但读取个人资料失败，请重试",
        );
    });

    test("bounds a stalled login", async () => {
        const h = harness({
            client: {
                isValid: () => false,
                userId: () => null,
                authenticate: () => new Promise<never>(() => {}),
                clear: () => {},
                onChange: () => () => {},
            },
            loginTimeoutMs: 10,
        });

        const result = await h.store.login({
            email: EMAIL,
            password: PASSWORD,
        });

        expect(result.error?.message).toBe("登录超时，请重试");
        h.store.dispose();
    });

    test("logout clears the credential and the file token", async () => {
        const h = harness();
        await h.store.login({ email: EMAIL, password: PASSWORD });
        expect(h.store.getSnapshot().status).toBe("authenticated");

        await h.store.logout();

        expect(h.store.getSnapshot()).toEqual({
            status: "anonymous",
            user: null,
        });
        expect(h.counters.fileTokenClears).toBeGreaterThan(0);
    });

    test("refresh re-reads the profile", async () => {
        const h = harness();
        h.credential.valid = true;
        h.credential.id = "user-1";
        await h.store.hydrate();

        h.store.refresh();
        await h.store.waitForAuth();

        expect(h.counters.profileReads).toEqual(["user-1", "user-1"]);
    });

    test("a stale profile read cannot overwrite a newer sign-in", async () => {
        const resolvers: Array<(user: User | null) => void> = [];
        const h = harness({
            fetchUser: () =>
                new Promise<User | null>((resolve) => {
                    resolvers.push(resolve);
                }),
        });
        h.credential.valid = true;
        h.credential.id = "user-1";

        const first = h.store.hydrate();
        // The account switches while the first profile read is still open.
        h.credential.id = "user-2";
        h.notify();
        const second = h.store.waitForAuth();

        expect(resolvers).toHaveLength(2);
        resolvers[1]?.(makeUser("user-2"));
        await second;
        resolvers[0]?.(makeUser("user-1"));
        await first;

        expect(h.store.getSnapshot().user?.id).toBe("user-2");
    });

    test("refreshes the file token only while signed in", async () => {
        const intervals: Array<() => void> = [];
        let cleared = 0;
        const h = harness({
            timers: {
                setInterval: (callback) => {
                    intervals.push(callback);
                    return intervals.length;
                },
                clearInterval: () => {
                    cleared += 1;
                },
            },
        });
        h.credential.valid = true;
        h.credential.id = "user-1";

        await h.store.hydrate();
        expect(intervals).toHaveLength(1);
        const before = h.counters.fileTokenCalls.length;
        intervals[0]?.();
        expect(h.counters.fileTokenCalls.length).toBe(before + 1);

        await h.store.logout();
        expect(cleared).toBe(1);
    });

    test("dispose stops listening to the credential", async () => {
        const h = harness();
        h.store.dispose();

        h.credential.valid = true;
        h.credential.id = "user-1";
        h.notify();
        await Promise.resolve();

        expect(h.counters.profileReads).toEqual([]);
    });
});
