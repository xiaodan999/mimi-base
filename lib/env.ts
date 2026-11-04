// env.ts

// This module sits on the critical path for every page (main -> auth -> pb),
// so it must not pull in a validation library: zod lives in the route chunks
// that actually use it (login, jizhang) instead.
const RAW_POCKETBASE_URL = import.meta.env.VITE_POCKETBASE_URL;

/**
 * Dev uses `same-origin` so the phone (which reaches Vite, not PocketBase)
 * talks to `/api` on whatever host it opened the page from. Vite proxies that
 * to the local PocketBase (see vite.config.ts). Production keeps an absolute
 * URL.
 */
function resolvePocketBaseUrl(value: string | undefined): string {
    if (value === "same-origin") {
        if (typeof window === "undefined") {
            throw new Error("VITE_POCKETBASE_URL=same-origin needs a browser");
        }
        return window.location.origin;
    }

    if (typeof value !== "string" || value.length === 0) {
        throw new Error("VITE_POCKETBASE_URL is required");
    }

    try {
        new URL(value);
    } catch {
        throw new Error(`VITE_POCKETBASE_URL is not a valid URL: ${value}`);
    }
    return value;
}

const POCKETBASE_URL = resolvePocketBaseUrl(RAW_POCKETBASE_URL);

const ENV = {
    POCKETBASE_URL,
    ENV: import.meta.env.NODE_ENV,
} as const;

// Export the result so we can use it in the project
export default ENV;
