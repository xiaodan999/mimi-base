/**
 * Tracks the date of the newest update entry the user has opened. Purely
 * local: it decides whether the profile page shows a dot next to 关于.
 */
const SEEN_KEY = "mimi:about:seen";

export function readSeenUpdate(): string | null {
    try {
        return localStorage.getItem(SEEN_KEY);
    } catch {
        // Private mode / storage disabled: treat everything as seen.
        return "";
    }
}

export function markUpdateSeen(date: string): void {
    try {
        localStorage.setItem(SEEN_KEY, date);
    } catch {
        // Non-fatal: the dot may reappear, nothing breaks.
    }
}

/** True when the newest update has not been opened yet. */
export function isUpdateUnseen(
    latest: string | undefined,
    seen: string | null,
): boolean {
    if (!latest) return false;
    return seen !== latest;
}
