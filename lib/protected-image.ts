/**
 * Protected PocketBase file URLs bake a 3-minute token into the `<img src>`.
 * The token heartbeat refreshes the module value, but existing DOM nodes keep
 * the old URL; a lazy image that enters the viewport later then 404s. On the
 * first error, fetch a fresh token and retry that image once.
 */

import { ensureFileToken } from "./pb";
import { protectedFileKey, withFileToken } from "./protected-image-url";

const RETRY_ATTR = "data-mimi-token-retry";

export function installProtectedImageRetry(): () => void {
    if (typeof document === "undefined") return () => {};

    const onError = (event: Event) => {
        const target = event.target;
        if (!(target instanceof HTMLImageElement)) return;
        const src = target.currentSrc || target.src;
        const key = protectedFileKey(src);
        if (!key) return;
        // One retry per image (per base URL), not one per token.
        if (target.getAttribute(RETRY_ATTR) === key) return;
        target.setAttribute(RETRY_ATTR, key);

        void ensureFileToken(true)
            .then((token) => {
                const next = withFileToken(src, token);
                if (next && next !== src) target.src = next;
            })
            .catch(() => {
                // Offline / expired session: the next render or refetch will
                // try again with a valid token.
            });
    };

    const onLoad = (event: Event) => {
        if (event.target instanceof HTMLImageElement) {
            event.target.removeAttribute(RETRY_ATTR);
        }
    };

    document.addEventListener("error", onError, true);
    document.addEventListener("load", onLoad, true);
    return () => {
        document.removeEventListener("error", onError, true);
        document.removeEventListener("load", onLoad, true);
    };
}
