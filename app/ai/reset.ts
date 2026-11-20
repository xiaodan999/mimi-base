/**
 * Per-device AI state that is not scoped by React Query.
 *
 * The AI cache and interrupted-task ledger are shared localStorage; keys and
 * prompts can contain one account's study progress, chat id or expense text.
 * Clear them when the signed-in account changes so the other account cannot
 * read the previous user's generated results.
 */

import { clearAiCache } from "./cache";
import { clearInterruptibleTasks } from "./interrupted";

const LAST_USER_KEY = "mimi:last-user-id";

export function clearAiDeviceState() {
    clearAiCache();
    clearInterruptibleTasks();
    try {
        if (typeof sessionStorage !== "undefined") {
            sessionStorage.removeItem("mimi:expense-parse:last");
            sessionStorage.removeItem("mimi:last-route");
        }
    } catch {
        // private mode / storage disabled
    }
}

/** Remember who owns the local AI state; clear it when the account changes. */
export function noteCurrentUser(userId: string) {
    if (!userId || typeof localStorage === "undefined") return;
    try {
        const previous = localStorage.getItem(LAST_USER_KEY);
        if (previous && previous !== userId) clearAiDeviceState();
        localStorage.setItem(LAST_USER_KEY, userId);
    } catch {
        // private mode / quota
    }
}

/** Explicit logout: the cache is already cleared, drop the ownership marker. */
export function forgetCurrentUser() {
    try {
        if (typeof localStorage !== "undefined") {
            localStorage.removeItem(LAST_USER_KEY);
        }
    } catch {
        // ignore
    }
}
