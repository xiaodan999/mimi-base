/**
 * In-memory rate limits and daily quotas.
 *
 * Both primitives sit on an injectable CounterStore so a test (or a future
 * shared Redis) can supply its own buckets. The default store is bounded and
 * sweeps expired entries so a stream of random caller ids cannot grow memory
 * without limit. Day buckets use the UTC calendar day, matching the old
 * per-service maps.
 */

export type CounterEntry = {
    count: number;
    /** Unix ms at which the entry resets. */
    expiresAt: number;
};

export type CounterStore = {
    get(key: string): CounterEntry | undefined;
    set(key: string, entry: CounterEntry): void;
    delete(key: string): void;
    clear(): void;
    readonly size: number;
};

export type MemoryCounterStoreOptions = {
    maxEntries?: number;
    now?: () => number;
};

const SWEEP_EVERY = 64;

export function createMemoryCounterStore(
    options: MemoryCounterStoreOptions = {},
): CounterStore {
    const maxEntries = Math.max(1, options.maxEntries ?? 10_000);
    const now = options.now ?? Date.now;
    const entries = new Map<string, CounterEntry>();
    let writes = 0;

    function sweep(): void {
        const stamp = now();
        for (const [key, entry] of entries) {
            if (entry.expiresAt <= stamp) entries.delete(key);
        }
    }

    return {
        get(key) {
            const entry = entries.get(key);
            if (!entry) return undefined;
            if (entry.expiresAt <= now()) {
                entries.delete(key);
                return undefined;
            }
            return entry;
        },
        set(key, entry) {
            entries.set(key, entry);
            writes += 1;
            if (writes % SWEEP_EVERY === 0) sweep();
            if (entries.size >= maxEntries) {
                sweep();
                // Still full: drop everything rather than grow without bound.
                // Callers only lose their window count, never correctness.
                if (entries.size >= maxEntries) entries.clear();
            }
        },
        delete(key) {
            entries.delete(key);
        },
        clear() {
            entries.clear();
        },
        get size() {
            return entries.size;
        },
    };
}

export type LimitResult =
    { allowed: true } | { allowed: false; retryAfterSeconds?: number };

export type Limiter = {
    check(key: string): LimitResult;
};

export type WindowLimiterOptions = {
    /** Namespaces the counter so limiters never collide. */
    name: string;
    limit: number;
    windowMs: number;
    now?: () => number;
};

/** A fixed 60-second (or custom) window. `limit <= 0` is unlimited. */
export function createWindowLimiter(
    store: CounterStore,
    options: WindowLimiterOptions,
): Limiter {
    const now = options.now ?? Date.now;
    const keyFor = (key: string) => `${options.name}:${key}`;

    return {
        check(key) {
            if (options.limit <= 0) return { allowed: true };
            const stamp = now();
            const storeKey = keyFor(key);
            const bucket = store.get(storeKey);
            if (!bucket) {
                store.set(storeKey, {
                    count: 1,
                    expiresAt: stamp + options.windowMs,
                });
                return { allowed: true };
            }
            if (bucket.count >= options.limit) {
                return {
                    allowed: false,
                    retryAfterSeconds: Math.max(
                        1,
                        Math.ceil((bucket.expiresAt - stamp) / 1000),
                    ),
                };
            }
            store.set(storeKey, {
                count: bucket.count + 1,
                expiresAt: bucket.expiresAt,
            });
            return { allowed: true };
        },
    };
}

export type DailyQuotaOptions = {
    name: string;
    limit: number;
    now?: () => number;
};

function utcDay(stamp: number): string {
    return new Date(stamp).toISOString().slice(0, 10);
}

function nextUtcMidnight(stamp: number): number {
    const date = new Date(stamp);
    return Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + 1,
    );
}

/** A per-UTC-day quota. `limit <= 0` is unlimited. */
export function createDailyQuota(
    store: CounterStore,
    options: DailyQuotaOptions,
): Limiter {
    const now = options.now ?? Date.now;

    return {
        check(key) {
            if (options.limit <= 0) return { allowed: true };
            const stamp = now();
            const day = utcDay(stamp);
            const storeKey = `${options.name}:${key}:${day}`;
            const bucket = store.get(storeKey);
            if (!bucket) {
                store.set(storeKey, {
                    count: 1,
                    expiresAt: nextUtcMidnight(stamp),
                });
                return { allowed: true };
            }
            if (bucket.count >= options.limit) {
                return { allowed: false };
            }
            store.set(storeKey, {
                count: bucket.count + 1,
                expiresAt: bucket.expiresAt,
            });
            return { allowed: true };
        },
    };
}
