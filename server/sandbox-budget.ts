/**
 * Per-run budget for sandbox host fetches.
 *
 * QuickJS's heap limit does not bound native `fetch` buffers, sockets or DNS
 * lookups. Without a host-side budget a single run can start thousands of
 * requests (`Promise.all`, a loop, or `sandbox.download`) and exhaust the API
 * process's memory or file descriptors.
 */

export type HostFetchBudget = {
    /** Reserve a slot; throws when the run is over budget. */
    acquire(): () => void;
    readonly active: number;
    readonly total: number;
};

export type HostFetchBudgetOptions = {
    /** Requests allowed to run at the same time. */
    maxActive?: number;
    /** Requests allowed during the whole run. */
    maxTotal?: number;
};

export function createHostFetchBudget(
    options: HostFetchBudgetOptions = {},
): HostFetchBudget {
    const maxActive = Math.max(1, options.maxActive ?? 4);
    const maxTotal = Math.max(1, options.maxTotal ?? 30);
    let active = 0;
    let total = 0;

    return {
        acquire() {
            if (total >= maxTotal) {
                throw new Error(`本轮最多联网 ${maxTotal} 次`);
            }
            if (active >= maxActive) {
                throw new Error(`同时最多 ${maxActive} 个联网请求`);
            }
            total += 1;
            active += 1;
            let released = false;
            return () => {
                if (released) return;
                released = true;
                active -= 1;
            };
        },
        get active() {
            return active;
        },
        get total() {
            return total;
        },
    };
}
