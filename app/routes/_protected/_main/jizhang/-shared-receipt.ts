/**
 * Page-side half of the Web Share Target handoff.
 *
 * `public/sw.js` receives the POST body, stores the first shared image under
 * `SHARE_CACHE` and redirects to `/jizhang?share=<id>`. The worker is a plain
 * public script, so the cache name, key prefix and id shape are mirrored here
 * by hand — change both files together.
 */
const SHARE_CACHE = "mimi-share";
const SHARE_PREFIX = "/__mimi-share/";
/** `${Date.now()}-${base36}` from the worker; keep the stash id opaque. */
const SHARE_ID = /^\d{10,}-[a-z0-9]+$/;

/**
 * Take and delete one stashed share. Returns null when the id is bogus, the
 * entry expired, or Cache Storage is unavailable (private mode, old browser).
 */
export async function takeSharedReceipt(id: string): Promise<File | null> {
    if (!SHARE_ID.test(id)) return null;
    if (typeof caches === "undefined") return null;

    const key = `${SHARE_PREFIX}${id}`;
    try {
        const cache = await caches.open(SHARE_CACHE);
        const response = await cache.match(key);
        if (!response) return null;
        await cache.delete(key);

        const blob = await response.blob();
        if (blob.size === 0) return null;

        const type =
            response.headers.get("content-type") || blob.type || "image/jpeg";
        const extension = type.includes("png")
            ? "png"
            : type.includes("webp")
              ? "webp"
              : "jpg";
        return new File([blob], `share-${id}.${extension}`, { type });
    } catch {
        return null;
    }
}
