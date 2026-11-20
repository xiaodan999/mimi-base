/** Pure URL helpers for the protected-image retry (no browser/PB imports). */

/** Rewrite the `token` query parameter of a protected file URL. */
export function withFileToken(url: string, token: string): string | null {
    if (!token || !url.includes("/api/files/")) return null;
    try {
        const parsed = new URL(url, "http://mimi.local");
        parsed.searchParams.set("token", token);
        return parsed.toString();
    } catch {
        return null;
    }
}

/** Stable identity for "this image", ignoring the expiring token. */
export function protectedFileKey(url: string): string | null {
    if (!url.includes("/api/files/")) return null;
    try {
        const parsed = new URL(url, "http://mimi.local");
        parsed.searchParams.delete("token");
        return parsed.toString();
    } catch {
        return null;
    }
}
