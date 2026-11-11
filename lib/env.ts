// env.ts

// This module sits on the critical path for every page (main -> auth -> pb),
// so it must not pull in a validation library: zod lives in the route chunks
// that actually use it (login, jizhang) instead.
const RAW_POCKETBASE_URL = import.meta.env.VITE_POCKETBASE_URL;

type ResolvedUrls = {
    /** PocketBase's SDK base, always ending in `/db`. */
    pocketbaseUrl: string;
    /** Origin that serves `/api` (hand-written Bun endpoints). */
    apiOrigin: string;
};

/**
 * PocketBase is mounted under `/db` so the app's own Bun endpoints can own
 * `/api` (see the production Caddyfile and Vite's dev proxy). Accept either
 * the bare PB origin (`https://pb.example.com`) or an explicit `/db` suffix,
 * and normalize both to `<origin>/db`.
 *
 * Dev uses `same-origin`: the phone reaches Vite, which proxies `/db` to
 * PocketBase and `/api` to the Bun API.
 */
function resolveUrls(value: string | undefined): ResolvedUrls {
    if (value === "same-origin") {
        if (typeof window === "undefined") {
            throw new Error("VITE_POCKETBASE_URL=same-origin needs a browser");
        }
        const origin = window.location.origin;
        return { pocketbaseUrl: `${origin}/db`, apiOrigin: origin };
    }

    if (typeof value !== "string" || value.length === 0) {
        throw new Error("VITE_POCKETBASE_URL is required");
    }

    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`VITE_POCKETBASE_URL is not a valid URL: ${value}`);
    }
    if (url.search || url.hash) {
        throw new Error(
            `VITE_POCKETBASE_URL must not have a query or fragment: ${value}`,
        );
    }
    const path = url.pathname.replace(/\/+$/, "");
    if (path !== "" && path !== "/db") {
        throw new Error(
            `VITE_POCKETBASE_URL must be an origin or end with /db: ${value}`,
        );
    }
    return { pocketbaseUrl: `${url.origin}/db`, apiOrigin: url.origin };
}

const RESOLVED = resolveUrls(RAW_POCKETBASE_URL);

/**
 * Build an absolute URL for a hand-written Bun endpoint. The path is relative
 * to `/api` (for example `apiUrl("/ai/models")` ->
 * `https://host/api/ai/models`).
 */
export function apiUrl(path: string): string {
    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `${RESOLVED.apiOrigin}/api${suffix}`;
}

const ENV = {
    POCKETBASE_URL: RESOLVED.pocketbaseUrl,
    API_ORIGIN: RESOLVED.apiOrigin,
    ENV: import.meta.env.NODE_ENV,
} as const;

// Export the result so we can use it in the project
export default ENV;
