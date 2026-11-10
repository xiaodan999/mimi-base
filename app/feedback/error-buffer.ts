/**
 * Small client-side ring buffer of recent page errors, sent with a bug report.
 *
 * We capture `error` / `unhandledrejection` events and wrap `console.error`
 * (never `console.log`). Entries are capped so a noisy session cannot bloat
 * the PocketBase row or the GitHub issue body. The store lives in memory on
 * purpose: it is a diagnostic snapshot of this session, not telemetry.
 */

export type FeedbackErrorKind = "error" | "unhandledrejection" | "console";

export type FeedbackErrorEntry = {
    /** ISO timestamp, shown in the report and the issue body. */
    at: string;
    kind: FeedbackErrorKind;
    message: string;
    /** Best-effort file:line / stack head. */
    source?: string;
};

export const MAX_FEEDBACK_ERRORS = 20;
export const MAX_ERROR_MESSAGE_CHARS = 500;

/** Newest-last ring buffer; pure so it is easy to test in Bun. */
export function appendFeedbackError(
    entries: readonly FeedbackErrorEntry[],
    entry: FeedbackErrorEntry,
    max = MAX_FEEDBACK_ERRORS,
): FeedbackErrorEntry[] {
    if (max <= 0) return [];
    return [...entries, entry].slice(-max);
}

function stringify(value: unknown): string {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.message || value.name;
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}

/** Collapse whitespace, strip control chars and cap one entry's text. */
export function formatFeedbackErrorText(value: unknown): string {
    return stringify(value)
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_ERROR_MESSAGE_CHARS);
}

function errorSource(error: unknown): string {
    if (!(error instanceof Error) || !error.stack) return "";
    const line = error.stack.split("\n").find((item) => item.trim() !== "");
    return formatFeedbackErrorText(line).slice(0, 200);
}

/* ------------------------------- store -------------------------------- */

let entries: readonly FeedbackErrorEntry[] = [];
const listeners = new Set<() => void>();
let installed = false;

export function getFeedbackErrors(): readonly FeedbackErrorEntry[] {
    return entries;
}

export function clearFeedbackErrors() {
    entries = [];
    for (const listener of listeners) listener();
}

export function subscribeFeedbackErrors(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function pushFeedbackError(
    entry: Omit<FeedbackErrorEntry, "at"> & { at?: string },
) {
    entries = appendFeedbackError(entries, {
        at: entry.at ?? new Date().toISOString(),
        kind: entry.kind,
        message: formatFeedbackErrorText(entry.message),
        ...(entry.source ? { source: entry.source.slice(0, 200) } : {}),
    });
    for (const listener of listeners) listener();
}

/**
 * Install window listeners + a `console.error` passthrough. Returns a cleanup
 * that restores the original console method. Safe to call in a non-browser
 * environment (it becomes a no-op), which keeps module imports test-friendly.
 */
export function installFeedbackCapture(): () => void {
    if (installed || typeof window === "undefined") return () => {};
    installed = true;

    const onError = (event: ErrorEvent) => {
        const source = event.filename
            ? `${event.filename}:${event.lineno}:${event.colno}`
            : undefined;
        pushFeedbackError({
            kind: "error",
            message: event.message || event.error || "页面错误",
            ...(source ? { source } : {}),
        });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
        const reason: unknown = event.reason;
        const source = errorSource(reason);
        pushFeedbackError({
            kind: "unhandledrejection",
            message: formatFeedbackErrorText(reason) || "未处理的 Promise 异常",
            ...(source ? { source } : {}),
        });
    };

    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
        originalConsoleError.apply(console, args);
        // Ignore React's development-only render warnings? No: they are
        // often the first clue, and the buffer keeps only the last 20.
        pushFeedbackError({
            kind: "console",
            message: args.map((arg) => formatFeedbackErrorText(arg)).join(" "),
        });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);
        console.error = originalConsoleError;
        installed = false;
    };
}

/* --------------------------- last route memory -------------------------- */

const LAST_ROUTE_KEY = "mimi:last-route";

/**
 * Remember the last feature page so /feedback can report where the bug was.
 * `/feedback` itself and `/profile` (the reporting hub) are skipped: the
 * useful context is the page the user came from before opening the form.
 */
export function rememberRoute(pathname: string) {
    if (typeof window === "undefined") return;
    if (
        !pathname ||
        pathname === "/feedback" ||
        pathname.startsWith("/feedback/") ||
        pathname === "/profile" ||
        pathname.startsWith("/profile/")
    ) {
        return;
    }
    try {
        sessionStorage.setItem(LAST_ROUTE_KEY, pathname);
    } catch {
        // private mode: the default route is still useful
    }
}

export function readLastRoute(): string {
    if (typeof window === "undefined") return "/home";
    try {
        return sessionStorage.getItem(LAST_ROUTE_KEY) || "/home";
    } catch {
        return "/home";
    }
}
