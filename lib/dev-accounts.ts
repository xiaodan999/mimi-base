/**
 * Dev-only accounts. `pocketbase/pb_hooks/dev_seed.pb.js` creates these rows
 * when the server runs with `MIMI_DEV=1`; keep the two lists in sync.
 *
 * In a production build Vite folds `import.meta.env.DEV` to false, so the
 * list is empty and the login page / `?dev=` URLs cannot sign anyone in.
 * These credentials are public (they are in the README) and the accounts do
 * not exist outside a dev database, so they are not secrets.
 */
export type DevAccount = {
    /** Short key used by `?dev=<key>`; also the seed's email local part. */
    key: string;
    email: string;
    password: string;
    name: string;
};

export const DEV_ACCOUNTS: readonly DevAccount[] = import.meta.env.DEV
    ? [
          {
              key: "test",
              email: "test@mimi.local",
              password: "mimi123456",
              name: "测试账号",
          },
          {
              key: "test2",
              email: "test2@mimi.local",
              password: "mimi123456",
              name: "测试账号二",
          },
      ]
    : [];

/**
 * Resolve a `?dev=` key. `accounts` exists so the pure lookup can be tested
 * without depending on the compile-time dev flag.
 */
export function findDevAccount(
    key: string | null | undefined,
    accounts: readonly DevAccount[] = DEV_ACCOUNTS,
): DevAccount | null {
    if (!key) return null;
    const normalized = key.trim().toLowerCase();
    if (!normalized) return null;
    return accounts.find((account) => account.key === normalized) ?? null;
}
