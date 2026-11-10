/**
 * Keep a post-login redirect inside the app. The value often comes from a
 * URL (`?redirect=`), so protocol-relative and absolute URLs must not survive
 * as a navigation target. Returns the pathname + search + hash or `null`.
 */
export function toInternalHref(
    value: string | null | undefined,
    origin: string,
): string | null {
    if (!value || !value.startsWith("/") || value.startsWith("//")) {
        return null;
    }

    try {
        const url = new URL(value, origin);
        if (url.origin !== origin) return null;
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return null;
    }
}
