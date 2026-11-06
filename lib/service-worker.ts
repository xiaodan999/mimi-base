import { toast } from "sonner";

let updateRequested = false;
let registration: ServiceWorkerRegistration | null = null;

function promptForUpdate(waiting: ServiceWorker) {
    toast("有新版本可用", {
        id: "sw-update",
        description: "刷新后即可使用最新版本。",
        duration: Infinity,
        action: {
            label: "刷新",
            onClick: () => {
                applyUpdate(waiting);
            },
        },
    });
}

/**
 * Hand control to the waiting worker. The page reloads on `controllerchange`,
 * so this returns `false` when nothing is waiting yet (the caller can fall
 * back to a plain reload).
 */
export function applyUpdate(waiting?: ServiceWorker | null): boolean {
    const worker = waiting ?? registration?.waiting ?? null;
    if (!worker) return false;
    updateRequested = true;
    worker.postMessage({ type: "SKIP_WAITING" });
    return true;
}

/**
 * Ask the browser to look for a new worker now. Used by the About page's
 * "检查更新" action; the periodic visibility check uses the same call.
 */
export async function checkForUpdate(): Promise<void> {
    if (!("serviceWorker" in navigator)) return;
    try {
        const reg =
            registration ??
            (await navigator.serviceWorker.getRegistration().catch(() => null));
        await reg?.update();
    } catch {
        // Offline or the worker is not available: nothing to do.
    }
}

/**
 * Registers the production service worker and surfaces a toast when a new
 * version is waiting. The worker never calls `skipWaiting()` on its own, so an
 * open tab keeps running the code it loaded until the user accepts.
 */
export function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
        // The first install also claims the page; only reload after an update
        // the user explicitly accepted.
        if (updateRequested) window.location.reload();
    });

    navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((reg) => {
            registration = reg;
            const watchInstalling = (installing: ServiceWorker) => {
                installing.addEventListener("statechange", () => {
                    if (
                        installing.state === "installed" &&
                        navigator.serviceWorker.controller
                    ) {
                        promptForUpdate(reg.waiting ?? installing);
                    }
                });
            };

            // A previous session may have downloaded the worker already.
            if (reg.waiting && navigator.serviceWorker.controller) {
                promptForUpdate(reg.waiting);
            }
            // `updatefound` can fire before this callback runs, so also attach
            // to an in-flight install directly.
            if (reg.installing) {
                watchInstalling(reg.installing);
            }

            reg.addEventListener("updatefound", () => {
                if (reg.installing) {
                    watchInstalling(reg.installing);
                }
            });

            // Check right away so a reload after a deploy surfaces the update,
            // and again when the tab becomes visible (at most once a minute).
            void checkForUpdate();
            let lastCheck = 0;
            const checkWhenVisible = () => {
                if (document.visibilityState !== "visible") return;
                const now = Date.now();
                if (now - lastCheck < 60_000) return;
                lastCheck = now;
                void checkForUpdate();
            };
            document.addEventListener("visibilitychange", checkWhenVisible);
        })
        .catch((error) => {
            console.error("service worker registration failed", error);
        });
}
