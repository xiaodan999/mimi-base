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

/** The parts of a router location this module needs. */
export type RouteLocation = {
    pathname: string;
    searchStr: string;
    hash: string;
};

/**
 * The in-app href for a location without the dev-only `?dev=` key.
 *
 * `?dev=` is a one-shot sign-in hint: it must never survive into a redirect
 * target or into the URL after signing in, otherwise the next render would
 * try the same sign-in again.
 */
export function hrefWithoutDev(location: RouteLocation): string {
    const params = new URLSearchParams(location.searchStr);
    params.delete("dev");
    const search = params.toString();
    const hash = location.hash ? `#${location.hash}` : "";
    return `${location.pathname}${search ? `?${search}` : ""}${hash}`;
}

export const DEFAULT_LOGIN_TARGET = "/home";

/**
 * Destination to open after signing in.
 *
 * A `/login` value must never be accepted: the login route would redirect to
 * itself, and while a transition is in flight that compounds into
 * `/login?redirect=/login?redirect=...` on every render.
 */
export function toLoginTarget(
    value: string | null | undefined,
    origin: string,
): string {
    const target = toInternalHref(value, origin);
    if (!target || /^\/login\/?(?:[?#]|$)/.test(target)) {
        return DEFAULT_LOGIN_TARGET;
    }
    return target;
}
