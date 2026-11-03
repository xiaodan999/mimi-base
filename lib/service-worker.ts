import { toast } from "sonner";

let updateRequested = false;

function promptForUpdate(waiting: ServiceWorker) {
    toast("有新版本可用", {
        id: "sw-update",
        description: "刷新后即可使用最新版本。",
        duration: Infinity,
        action: {
            label: "刷新",
            onClick: () => {
                updateRequested = true;
                waiting.postMessage({ type: "SKIP_WAITING" });
            },
        },
    });
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
        .then((registration) => {
            const watchInstalling = (installing: ServiceWorker) => {
                installing.addEventListener("statechange", () => {
                    if (
                        installing.state === "installed" &&
                        navigator.serviceWorker.controller
                    ) {
                        promptForUpdate(registration.waiting ?? installing);
                    }
                });
            };

            // A previous session may have downloaded the worker already.
            if (registration.waiting && navigator.serviceWorker.controller) {
                promptForUpdate(registration.waiting);
            }
            // `updatefound` can fire before this callback runs, so also attach
            // to an in-flight install directly.
            if (registration.installing) {
                watchInstalling(registration.installing);
            }

            registration.addEventListener("updatefound", () => {
                if (registration.installing) {
                    watchInstalling(registration.installing);
                }
            });

            // Check right away so a reload after a deploy surfaces the update,
            // and again when the tab becomes visible (at most once a minute).
            void registration.update();
            let lastCheck = 0;
            const checkForUpdate = () => {
                if (document.visibilityState !== "visible") return;
                const now = Date.now();
                if (now - lastCheck < 60_000) return;
                lastCheck = now;
                void registration.update();
            };
            document.addEventListener("visibilitychange", checkForUpdate);
        })
        .catch((error) => {
            console.error("service worker registration failed", error);
        });
}
