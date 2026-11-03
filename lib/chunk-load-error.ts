/** At most one automatic reload per window, so a truly missing chunk can't loop. */
const RELOAD_KEY = "mimi:chunk-reload-at";
const RELOAD_WINDOW_MS = 60_000;

const CHUNK_ERROR_PATTERNS = [
    /failed to fetch dynamically imported module/i,
    /error loading dynamically imported module/i,
    /importing a module script failed/i,
    /failed to load module script/i,
    /chunkloaderror/i,
    /loading chunk \S+ failed/i,
];

/**
 * True when a lazy chunk could not be downloaded: a network blip, or a tab
 * still referencing asset names from a deploy that has since been replaced.
 * React.lazy memoises the rejection, so re-rendering or resetting the router
 * never retries the import — only a reload fetches the current chunk.
 */
export function isChunkLoadError(error: unknown): boolean {
    const message =
        error instanceof Error
            ? `${error.name} ${error.message}`
            : typeof error === "string"
              ? error
              : "";
    return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Reloads the page to recover from a chunk load error. Returns false when a
 * reload already happened within the last minute (or storage is unavailable),
 * so the caller can show the error instead of reloading forever.
 */
export function reloadOnce(): boolean {
    try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
        if (Date.now() - last < RELOAD_WINDOW_MS) return false;
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
        return false;
    }
    window.location.reload();
    return true;
}
